// Extra metadata for the watch and detail pages: per-episode titles,
// synopses and stills, artwork, and the full character list with voice actors.
// Server components only. Episode data and fan artwork come from ani.zip, which
// maps AniList ids to TVDB / fanart.tv; characters come from AniList.

import { plainText, type MediaDetail } from "./anilist";

export type EpisodeMeta = {
  number: number;
  title?: string;
  overview?: string;
  image?: string;
  airDate?: string;
};

export type Artwork = { url: string; kind: "Poster" | "Banner" | "Fanart" | "Still" | "Character" };

type AniZip = {
  episodes?: Record<
    string,
    {
      episode?: string;
      episodeNumber?: number;
      title?: Record<string, string | null> | null;
      overview?: string | null;
      summary?: string | null;
      image?: string | null;
      airdate?: string | null;
      airDate?: string | null;
      airDateUtc?: string | null;
    }
  >;
  images?: { coverType?: string; url?: string }[];
};

async function aniZip(id: number): Promise<AniZip | null> {
  try {
    const res = await fetch(`https://api.ani.zip/mappings?anilist_id=${id}`, { next: { revalidate: 21600 } });
    return res.ok ? ((await res.json()) as AniZip) : null;
  } catch {
    return null;
  }
}

/**
 * Hero art from TVDB: the series' top-rated 1080p background (sharper and better framed than
 * AniList's banner strip) and its transparent title logo. Either may be null.
 */
export async function getHeroArt(id: number): Promise<{ backdrop: string | null; logo: string | null }> {
  const z = await aniZip(id);
  const find = (type: string) => z?.images?.find((i) => i.coverType?.toLowerCase() === type)?.url ?? null;
  const logo = find("clearlogo");
  // Some "clearlogos" are old JPEG icons with a solid background; only PNGs are see-through.
  return { backdrop: find("fanart"), logo: logo && /\.png$/i.test(logo) ? logo : null };
}

/** Episode titles, synopses, stills and air dates, keyed by episode number. */
export async function getEpisodeMeta(m: MediaDetail): Promise<Record<number, EpisodeMeta>> {
  const out: Record<number, EpisodeMeta> = {};

  // AniList's own streaming episodes ("Episode 3 - Title") as a fallback.
  for (const s of m.streamingEpisodes ?? []) {
    const match = /^Episode\s+(\d+)\s*[-:]\s*(.+)$/i.exec(s.title);
    if (match) out[Number(match[1])] = { number: Number(match[1]), title: match[2], image: s.thumbnail };
  }

  const z = await aniZip(m.id);
  for (const [key, e] of Object.entries(z?.episodes ?? {})) {
    const n = Number(e.episode ?? e.episodeNumber ?? key);
    if (!Number.isInteger(n) || n < 1) continue;
    const t = e.title ?? {};
    out[n] = {
      number: n,
      title: t.en || t["x-jat"] || t.ja || out[n]?.title,
      overview: (e.overview || e.summary || undefined)?.trim(),
      image: e.image || out[n]?.image,
      airDate: e.airDateUtc || e.airdate || e.airDate || undefined,
    };
  }
  return out;
}

/** Posters, banners, fan art and episode stills for one show. */
export async function getArtwork(m: MediaDetail, episodes: Record<number, EpisodeMeta>): Promise<Artwork[]> {
  const seen = new Set<string>();
  const out: Artwork[] = [];
  const add = (url: string | null | undefined, kind: Artwork["kind"]) => {
    if (url && !seen.has(url)) {
      seen.add(url);
      out.push({ url, kind });
    }
  };

  add(m.coverImage.extraLarge ?? m.coverImage.large, "Poster");
  add(m.bannerImage, "Banner");
  const z = await aniZip(m.id);
  for (const img of z?.images ?? []) {
    const t = img.coverType?.toLowerCase();
    if (t === "poster") add(img.url, "Poster");
    else if (t === "banner") add(img.url, "Banner");
    else if (t === "fanart") add(img.url, "Fanart");
  }
  for (const e of Object.values(episodes)) add(e.image, "Still");
  for (const r of m.relations.edges) {
    if (r.node.type === "ANIME" && r.relationType !== "CHARACTER") add(r.node.coverImage.extraLarge, "Poster");
  }
  return out;
}

export type VoiceActor = { name: string; image: string | null; language: string };

export type Character = {
  id: number;
  name: string;
  native: string | null;
  image: string | null;
  role: string;
  description: string;
  voiceActors: { japanese: VoiceActor[]; english: VoiceActor[] };
};

type CharPage = {
  Media: {
    characters: {
      pageInfo: { hasNextPage: boolean };
      edges: {
        role: string;
        jp: { name: { full: string }; image: { medium: string | null }; languageV2: string }[];
        en: { name: { full: string }; image: { medium: string | null }; languageV2: string }[];
        node: {
          id: number;
          name: { full: string; native: string | null };
          image: { large: string | null; medium: string | null };
          description: string | null;
        };
      }[];
    };
  } | null;
};

/** Every character (up to 100) with description and Japanese/English voice actors. */
export async function getCharacters(id: number): Promise<Character[]> {
  const out: Character[] = [];
  for (let page = 1; page <= 4; page++) {
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        query: `query ($id: Int, $page: Int) {
          Media(id: $id, type: ANIME) {
            characters(page: $page, perPage: 25, sort: [ROLE, RELEVANCE, ID]) {
              pageInfo { hasNextPage }
              edges {
                role
                jp: voiceActors(language: JAPANESE, sort: [RELEVANCE, ID]) { name { full } image { medium } languageV2 }
                en: voiceActors(language: ENGLISH, sort: [RELEVANCE, ID]) { name { full } image { medium } languageV2 }
                node { id name { full native } image { large medium } description(asHtml: false) }
              }
            }
          }
        }`,
        variables: { id, page },
      }),
      next: { revalidate: 86400 },
    }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as { data?: CharPage } | null;
    const chars = json?.data?.Media?.characters;
    if (!chars) break;
    for (const e of chars.edges) {
      const va = (v: (typeof e.jp)[number]): VoiceActor => ({ name: v.name.full, image: v.image.medium, language: v.languageV2 });
      out.push({
        id: e.node.id,
        name: e.node.name.full,
        native: e.node.name.native,
        image: e.node.image.large ?? e.node.image.medium,
        role: e.role,
        // AniList hides spoilers in ~!...!~ and uses __bold__ markup.
        description: plainText(e.node.description)
          .replace(/~!([\s\S]*?)!~/g, "")
          .replace(/__(.+?)__/g, "$1")
          .trim(),
        voiceActors: { japanese: e.jp.map(va), english: e.en.map(va) },
      });
    }
    if (!chars.pageInfo.hasNextPage) break;
  }
  return out;
}
