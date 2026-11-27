// Thin client for the public AniList GraphQL API (https://docs.anilist.co).
// Used from server components only, so responses are cached by Next.js.

const ENDPOINT = "https://graphql.anilist.co";

export type MediaTitle = {
  romaji: string | null;
  english: string | null;
  native: string | null;
  userPreferred: string | null;
};

export type MediaCard = {
  id: number;
  title: MediaTitle;
  coverImage: { extraLarge: string | null; large: string | null; color: string | null };
  bannerImage: string | null;
  format: string | null;
  status: string | null;
  episodes: number | null;
  averageScore: number | null;
  seasonYear: number | null;
  genres: string[];
  description?: string | null;
  nextAiringEpisode: { episode: number; airingAt: number } | null;
};

export type ExternalLink = { url: string; site: string; type: string | null; icon: string | null; color: string | null };

export type MediaDetail = MediaCard & {
  duration: number | null;
  season: string | null;
  popularity: number | null;
  source: string | null;
  startDate: { year: number | null; month: number | null; day: number | null };
  trailer: { id: string; site: string } | null;
  studios: { nodes: { name: string }[] };
  externalLinks: ExternalLink[];
  streamingEpisodes: { title: string; thumbnail: string; url: string; site: string }[];
  characters: {
    edges: { role: string; node: { name: { full: string }; image: { medium: string | null } } }[];
  };
  relations: { edges: { relationType: string; node: MediaCard & { type: string } }[] };
  recommendations: { nodes: { mediaRecommendation: MediaCard | null }[] };
};

export type AiringItem = { id: number; airingAt: number; episode: number; media: MediaCard };

const CARD_FIELDS = `
  id
  title { romaji english native userPreferred }
  coverImage { extraLarge large color }
  bannerImage
  format
  status
  episodes
  averageScore
  seasonYear
  genres
  nextAiringEpisode { episode airingAt }
`;

async function query<T>(gql: string, variables: Record<string, unknown> = {}, revalidate = 3600): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query: gql, variables }),
    next: { revalidate },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.errors) {
    const msg = json?.errors?.[0]?.message ?? `AniList request failed (${res.status})`;
    throw new Error(msg);
  }
  return json.data as T;
}

export function titleOf(t: MediaTitle): string {
  return t.english || t.userPreferred || t.romaji || t.native || "Untitled";
}

export function currentSeason(date = new Date()): { season: string; year: number } {
  const m = date.getMonth();
  const season = m < 3 ? "WINTER" : m < 6 ? "SPRING" : m < 9 ? "SUMMER" : "FALL";
  return { season, year: date.getFullYear() };
}

function nextSeason(date = new Date()) {
  const order = ["WINTER", "SPRING", "SUMMER", "FALL"];
  const { season, year } = currentSeason(date);
  const i = order.indexOf(season);
  return i === 3 ? { season: "WINTER", year: year + 1 } : { season: order[i + 1], year };
}

/** Episodes that have actually aired (or the full count for finished shows). */
export function airedEpisodes(m: Pick<MediaCard, "episodes" | "nextAiringEpisode" | "status">): number {
  if (m.nextAiringEpisode) return Math.max(0, m.nextAiringEpisode.episode - 1);
  if (m.status === "NOT_YET_RELEASED") return 0;
  return m.episodes ?? 0;
}

export type LatestEpisode = { episode: number; airingAt: number; media: MediaCard };

export async function getHome() {
  const now = currentSeason();
  const next = nextSeason();
  // Rounded to 15 minutes so the cached response is reused.
  const nowTs = Math.floor(Date.now() / 1000 / 900) * 900;
  type Page = { media: MediaCard[] };
  const data = await query<{
    trending: Page;
    season: Page;
    upcoming: Page;
    top: Page;
    popular: Page;
    airing: Page;
    soon: Page;
    latest: { airingSchedules: (LatestEpisode & { media: MediaCard & { isAdult: boolean; popularity: number } })[] };
    latest2: { airingSchedules: (LatestEpisode & { media: MediaCard & { isAdult: boolean; popularity: number } })[] };
  }>(
    `query ($season: MediaSeason, $year: Int, $nSeason: MediaSeason, $nYear: Int, $since: Int, $now: Int) {
      trending: Page(perPage: 20) { media(type: ANIME, sort: TRENDING_DESC, isAdult: false) { ${CARD_FIELDS} description(asHtml: false) } }
      season: Page(perPage: 20) { media(type: ANIME, season: $season, seasonYear: $year, sort: POPULARITY_DESC, isAdult: false) { ${CARD_FIELDS} } }
      upcoming: Page(perPage: 20) { media(type: ANIME, season: $nSeason, seasonYear: $nYear, sort: POPULARITY_DESC, isAdult: false) { ${CARD_FIELDS} } }
      top: Page(perPage: 20) { media(type: ANIME, sort: SCORE_DESC, isAdult: false) { ${CARD_FIELDS} } }
      popular: Page(perPage: 20) { media(type: ANIME, sort: POPULARITY_DESC, isAdult: false) { ${CARD_FIELDS} } }
      airing: Page(perPage: 10) { media(type: ANIME, status: RELEASING, sort: TRENDING_DESC, isAdult: false) { ${CARD_FIELDS} } }
      soon: Page(perPage: 10) { media(type: ANIME, status: NOT_YET_RELEASED, sort: POPULARITY_DESC, isAdult: false) { ${CARD_FIELDS} } }
      latest: Page(page: 1, perPage: 50) {
        airingSchedules(airingAt_greater: $since, airingAt_lesser: $now, sort: TIME_DESC) {
          episode airingAt media { ${CARD_FIELDS} isAdult popularity }
        }
      }
      latest2: Page(page: 2, perPage: 50) {
        airingSchedules(airingAt_greater: $since, airingAt_lesser: $now, sort: TIME_DESC) {
          episode airingAt media { ${CARD_FIELDS} isAdult popularity }
        }
      }
    }`,
    {
      season: now.season,
      year: now.year,
      nSeason: next.season,
      nYear: next.year,
      since: nowTs - 7 * 86400,
      now: nowTs,
    },
    900,
  );

  // One entry per show (its newest episode), skipping adult and very obscure titles.
  const seen = new Set<number>();
  const latest: LatestEpisode[] = [];
  for (const s of [...data.latest.airingSchedules, ...data.latest2.airingSchedules]) {
    if (s.media.isAdult || s.media.popularity < 2000 || seen.has(s.media.id)) continue;
    seen.add(s.media.id);
    latest.push(s);
  }

  return {
    trending: data.trending.media,
    season: data.season.media,
    upcoming: data.upcoming.media,
    top: data.top.media,
    popular: data.popular.media,
    topAiring: data.airing.media,
    upcomingSoon: data.soon.media,
    latest,
    seasonLabel: `${now.season.toLowerCase()} ${now.year}`,
  };
}

export async function getSeasonal(season: string, year: number, page = 1) {
  const data = await query<{ Page: { pageInfo: { hasNextPage: boolean }; media: (MediaCard & { description: string | null })[] } }>(
    `query ($season: MediaSeason, $year: Int, $page: Int) {
      Page(page: $page, perPage: 30) {
        pageInfo { hasNextPage }
        media(type: ANIME, season: $season, seasonYear: $year, sort: [TRENDING_DESC, POPULARITY_DESC], isAdult: false) {
          ${CARD_FIELDS} description(asHtml: false)
        }
      }
    }`,
    { season, year, page },
    1800,
  );
  return data.Page;
}

export type SearchParams = {
  search?: string;
  genres?: string[];
  tags?: string[];
  formats?: string[];
  status?: string;
  year?: number;
  season?: string;
  source?: string;
  country?: string;
  /** Minimum average score, 0–100. */
  minScore?: number;
  sort?: string;
  page?: number;
};

export const SEARCH_PER_PAGE = 28;

/** The search filters kept in the URL (besides q / type / page). */
export const SEARCH_FILTER_KEYS = ["genres", "tags", "formats", "status", "year", "sort", "source", "country", "score", "season"];

export async function searchAnime(p: SearchParams) {
  const sort = p.sort || (p.search ? "SEARCH_MATCH" : "POPULARITY_DESC");
  const data = await query<{ Page: { pageInfo: { hasNextPage: boolean; currentPage: number }; media: MediaCard[] } }>(
    `query ($search: String, $genres: [String], $tags: [String], $formats: [MediaFormat], $status: MediaStatus,
            $year: Int, $season: MediaSeason, $source: MediaSource, $country: CountryCode, $minScore: Int,
            $sort: [MediaSort], $page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        pageInfo { hasNextPage currentPage }
        media(type: ANIME, search: $search, genre_in: $genres, tag_in: $tags, format_in: $formats, status: $status,
              seasonYear: $year, season: $season, source: $source, countryOfOrigin: $country,
              averageScore_greater: $minScore, sort: $sort, isAdult: false) { ${CARD_FIELDS} }
      }
    }`,
    {
      search: p.search || undefined,
      genres: p.genres?.length ? p.genres : undefined,
      tags: p.tags?.length ? p.tags : undefined,
      formats: p.formats?.length ? p.formats : undefined,
      status: p.status || undefined,
      year: p.year || undefined,
      season: p.season || undefined,
      source: p.source || undefined,
      country: p.country || undefined,
      minScore: p.minScore || undefined,
      sort: [sort],
      page: p.page || 1,
      perPage: SEARCH_PER_PAGE,
    },
    600,
  );
  return data.Page;
}

export type PersonCard = { id: number; name: string; native: string | null; image: string | null; favourites: number; sub: string | null };

/** Characters or staff by name (or the most favourited when there's no search). */
export async function searchPeople(kind: "characters" | "staff", search: string | undefined, page = 1) {
  const sort = search ? "[SEARCH_MATCH, FAVOURITES_DESC]" : "[FAVOURITES_DESC]";
  const fields =
    kind === "characters"
      ? `characters(search: $search, sort: ${sort}) { id name { full native } image { large } favourites media(perPage: 1, sort: POPULARITY_DESC) { nodes { title { romaji english native userPreferred } } } }`
      : `staff(search: $search, sort: ${sort}) { id name { full native } image { large } favourites primaryOccupations }`;
  type Raw = {
    id: number;
    name: { full: string; native: string | null };
    image: { large: string | null };
    favourites: number;
    media?: { nodes: { title: MediaTitle }[] };
    primaryOccupations?: string[];
  };
  const data = await query<{ Page: { pageInfo: { hasNextPage: boolean }; characters?: Raw[]; staff?: Raw[] } }>(
    `query ($search: String, $page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) { pageInfo { hasNextPage } ${fields} }
    }`,
    { search: search || undefined, page, perPage: SEARCH_PER_PAGE },
    3600,
  );
  const people: PersonCard[] = (data.Page[kind] ?? []).map((r) => ({
    id: r.id,
    name: r.name.full,
    native: r.name.native,
    image: r.image.large,
    favourites: r.favourites,
    sub: r.media?.nodes[0] ? titleOf(r.media.nodes[0].title) : (r.primaryOccupations?.[0] ?? null),
  }));
  return { pageInfo: data.Page.pageInfo, people };
}

/** AniList's tag list (non-adult), for the search filters. */
export async function getTags(): Promise<{ name: string; category: string }[]> {
  const data = await query<{ MediaTagCollection: { name: string; category: string; isAdult: boolean }[] }>(
    `query { MediaTagCollection { name category isAdult } }`,
    {},
    86400,
  );
  return data.MediaTagCollection.filter((t) => !t.isAdult)
    .map(({ name, category }) => ({ name, category }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export const SOURCES = [
  "ORIGINAL", "MANGA", "LIGHT_NOVEL", "VISUAL_NOVEL", "VIDEO_GAME", "NOVEL", "WEB_NOVEL", "DOUJINSHI", "ANIME", "OTHER",
];
export const COUNTRIES: [string, string][] = [
  ["JP", "Japan"],
  ["KR", "South Korea"],
  ["CN", "China"],
  ["TW", "Taiwan"],
];

export async function getAnime(id: number): Promise<MediaDetail | null> {
  const data = await query<{ Media: MediaDetail | null }>(
    `query ($id: Int) {
      Media(id: $id, type: ANIME) {
        ${CARD_FIELDS}
        description(asHtml: false)
        duration
        season
        popularity
        source
        startDate { year month day }
        trailer { id site }
        studios(isMain: true) { nodes { name } }
        externalLinks { url site type icon color }
        streamingEpisodes { title thumbnail url site }
        characters(perPage: 12, sort: [ROLE, RELEVANCE]) { edges { role node { name { full } image { medium } } } }
        relations { edges { relationType node { ${CARD_FIELDS} type } } }
        recommendations(perPage: 14, sort: RATING_DESC) { nodes { mediaRecommendation { ${CARD_FIELDS} } } }
      }
    }`,
    { id },
    3600,
  ).catch((e: Error) => {
    if (/not found/i.test(e.message)) return { Media: null };
    throw e;
  });
  return data.Media;
}

export async function getSchedule(days = 7): Promise<AiringItem[]> {
  const start = Math.floor(Date.now() / 1000) - 60 * 60 * 6;
  const end = start + days * 86400;
  const items: AiringItem[] = [];
  for (let page = 1; page <= 4; page++) {
    const data = await query<{ Page: { pageInfo: { hasNextPage: boolean }; airingSchedules: AiringItem[] } }>(
      `query ($start: Int, $end: Int, $page: Int) {
        Page(page: $page, perPage: 50) {
          pageInfo { hasNextPage }
          airingSchedules(airingAt_greater: $start, airingAt_lesser: $end, sort: TIME) {
            id airingAt episode
            media { ${CARD_FIELDS} isAdult }
          }
        }
      }`,
      { start, end, page },
      900,
    );
    items.push(...data.Page.airingSchedules.filter((s) => !(s.media as MediaCard & { isAdult?: boolean }).isAdult));
    if (!data.Page.pageInfo.hasNextPage) break;
  }
  return items;
}

export const GENRES = [
  "Action", "Adventure", "Comedy", "Drama", "Ecchi", "Fantasy", "Horror", "Mahou Shoujo", "Mecha",
  "Music", "Mystery", "Psychological", "Romance", "Sci-Fi", "Slice of Life", "Sports", "Supernatural", "Thriller",
];

export const FORMATS = ["TV", "TV_SHORT", "MOVIE", "SPECIAL", "OVA", "ONA"];

/** AniList descriptions contain a little HTML; turn them into plain text. */
export function plainText(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** CSS class for the coloured airing-status dot: green airing, blue finished, amber upcoming. */
export function statusDot(status: string | null | undefined): string {
  return status === "RELEASING" ? "dot--airing" : status === "NOT_YET_RELEASED" ? "dot--upcoming" : "dot--finished";
}

export function prettyEnum(v: string | null | undefined): string {
  if (!v) return "";
  if (v === "TV" || v === "OVA" || v === "ONA") return v;
  return v
    .toLowerCase()
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}
