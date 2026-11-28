// Episodes and streams from KickAssAnime (https://kaa.lt), ported from aquaryuo's Seanime
// extension. A show is matched to AniList by title (and year when several match). Sub is the
// Japanese locale, dub the English one. Its HLS streams only play with the player site's
// Origin / Referer, which browsers can't send, so they go through the AniFlow API's proxy.

import { getAnime } from "../anilist";
import type { AnimeRef, Audio, EpisodeInfo, SourceProvider, Stream, SubtitleTrack } from "./types";

const BASE = "https://kaa.lt";
const PROXY_URL = (process.env.ANIFLOW_BASE_URL ?? "").replace(/\/$/, "");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const LOCALE: Record<Audio, string> = { sub: "ja-JP", dub: "en-US" };

type Show = { slug: string; locales: string[] };
type Card = { slug: string; titles: string[]; year: number | null; locales: string[] };
type KaaEpisode = { episode_number?: number | string; slug?: string; title?: string };

async function api<T>(path: string, init: RequestInit = {}, revalidate = 600): Promise<T | null> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "User-Agent": UA, Accept: "application/json", Referer: `${BASE}/`, ...init.headers },
    next: { revalidate },
  }).catch(() => null);
  return res?.ok ? ((await res.json().catch(() => null)) as T | null) : null;
}

const norm = (s: string) =>
  s.normalize("NFKC").toLowerCase().replace(/[’']/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

async function search(query: string): Promise<Card[]> {
  const body = await api<{ result?: { slug?: string; title?: string; title_en?: string; year?: number; locales?: string[] }[] }>(
    "/api/fsearch",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page: 1, query }) },
  );
  return (body?.result ?? [])
    .filter((r) => typeof r.slug === "string" && /^[\w-]{1,160}$/.test(r.slug))
    .map((r) => ({
      slug: r.slug!,
      titles: [r.title, r.title_en].filter((t): t is string => typeof t === "string" && !!t.trim()),
      year: typeof r.year === "number" ? r.year : null,
      locales: Array.isArray(r.locales) ? r.locales : [],
    }));
}

// AniList id → KickAssAnime show (null: no confident match), remembered for this server's life.
const shows = new Map<number, Promise<Show | null>>();

/** The KickAssAnime show for an AniList anime: an exact title match, the right year when several match. */
function findShow(anime: AnimeRef): Promise<Show | null> {
  let p = shows.get(anime.id);
  if (!p) {
    p = (async () => {
      const m = await getAnime(anime.id).catch(() => null);
      const names = [m?.title.english, m?.title.romaji, anime.title].filter((t): t is string => !!t);
      const wanted = new Set(names.map(norm));
      const year = m?.seasonYear ?? m?.startDate?.year ?? null;
      for (const q of [...new Set(names)]) {
        const hits = (await search(q)).filter((c) => c.titles.some((t) => wanted.has(norm(t))));
        const pick = hits.find((c) => year && c.year === year) ?? (hits.length === 1 ? hits[0] : null);
        if (pick) return { slug: pick.slug, locales: pick.locales };
      }
      return null;
    })();
    p.catch(() => shows.delete(anime.id));
    shows.set(anime.id, p);
  }
  return p;
}

const epNumber = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : 0;
};

/** One page of a show's episode list (KickAssAnime pages by episode number). */
function episodePage(slug: string, ep: number, lang: string) {
  return api<{ pages?: { eps?: (number | string)[] }[]; result?: KaaEpisode[] }>(
    `/api/show/${slug}/episodes?ep=${ep}&lang=${encodeURIComponent(lang)}`,
  );
}

/** The `astro-island` props on KickAssAnime's player page: the HLS manifest and subtitle files. */
function parsePlayer(html: string): { manifest: string; subtitles: { src: string; name: string; language: string }[] } | null {
  const raw = html.match(/<astro-island[^>]*\sprops="([^"]*)"/)?.[1];
  if (!raw) return null;
  // Astro serialises props as [type, value] pairs: 0 = plain value / object, 1 = array.
  const unwrap = (v: unknown): unknown => {
    if (!Array.isArray(v)) return v;
    const [t, x] = v as [number, unknown];
    if (t === 1) return Array.isArray(x) ? x.map(unwrap) : [];
    if (t === 0 && x && typeof x === "object" && !Array.isArray(x)) {
      return Object.fromEntries(Object.entries(x).map(([k, val]) => [k, unwrap(val)]));
    }
    return x;
  };
  let props: { manifest?: string; subtitles?: { src?: string; name?: string; language?: string }[] };
  try {
    props = unwrap([0, JSON.parse(raw.replace(/&quot;/g, '"').replace(/&amp;/g, "&"))]) as typeof props;
  } catch {
    return null;
  }
  const fix = (u: unknown) => (typeof u === "string" ? u.trim().replace(/^\/\/(?=[^/])/, "https://") : "");
  const manifest = fix(props.manifest);
  if (!/^https:\/\/[^/]+\/.*\.m3u8(?:[?#]|$)/i.test(manifest)) return null;
  const subtitles = (props.subtitles ?? [])
    .map((s) => ({ src: fix(s.src), name: String(s.name ?? ""), language: String(s.language ?? "") }))
    .filter((s) => /^https?:\/\//.test(s.src));
  return { manifest, subtitles };
}

function proxied(path: "m3u8" | "subtitles", url: string, origin: string, audio?: Audio): string {
  const params = new URLSearchParams({ url, referer: `${origin}/`, origin });
  if (audio) params.set("audio", audio === "dub" ? "english" : "japanese");
  return `${PROXY_URL}/api/proxy/${path}?${params}`;
}

export const kickassanimeProvider: SourceProvider = {
  id: "kickassanime",
  name: "KickAssAnime",
  audio: ["sub", "dub"],
  tags: ["s-sub"],

  // Streams need the AniFlow API's proxy for their headers.
  isEnabled() {
    return Boolean(PROXY_URL);
  },

  async getEpisodes(anime: AnimeRef): Promise<EpisodeInfo[]> {
    const show = await findShow(anime);
    if (!show) return [];
    const page = await episodePage(show.slug, 1, LOCALE.sub);
    if (!page) return [];
    const titles = new Map((page.result ?? []).map((e) => [epNumber(e.episode_number), e.title ?? ""]));
    const nums = new Set<number>();
    for (const p of page.pages ?? []) for (const v of p.eps ?? []) if (epNumber(v)) nums.add(epNumber(v));
    const dub = show.locales.includes(LOCALE.dub);
    return [...nums]
      .sort((a, b) => a - b)
      .map((number) => ({ number, title: titles.get(number) || undefined, dub }));
  },

  async getStream(anime: AnimeRef, episode: number, audio: Audio = "sub"): Promise<Stream | null> {
    const show = await findShow(anime);
    const lang = LOCALE[audio];
    if (!show || !show.locales.includes(lang)) return null;

    const page = await episodePage(show.slug, episode, lang);
    const slug = page?.result?.find((e) => epNumber(e.episode_number) === episode)?.slug;
    if (!slug || !/^[\w-]{1,64}$/.test(slug)) return null;

    const detail = await api<{ servers?: { name?: string; src?: string }[] }>(`/api/show/${show.slug}/episode/ep-${episode}-${slug}`);
    // HLS servers only (not DASH), VidStreaming first.
    const servers = (detail?.servers ?? [])
      .filter((s) => typeof s.src === "string" && /^https:\/\//.test(s.src) && !/[?&]type=dash\b/.test(s.src))
      .sort((a, b) => Number(/vidstream/i.test(b.name ?? "")) - Number(/vidstream/i.test(a.name ?? "")));

    for (const server of servers.slice(0, 2)) {
      const res = await fetch(server.src!.replace("/cat-player/vast?", "/cat-player/player?"), {
        headers: { "User-Agent": UA, Referer: `${BASE}/` },
        cache: "no-store",
      }).catch(() => null);
      const player = res?.ok ? parsePlayer(await res.text()) : null;
      if (!player) continue;
      const origin = new URL(server.src!).origin;
      // English first on by default (the list isn't in any particular order).
      const english = player.subtitles.findIndex((s) => /^en/i.test(s.language) || /english/i.test(s.name));
      const subtitles: SubtitleTrack[] = player.subtitles.map((s, i) => ({
        url: proxied("subtitles", s.src, origin),
        lang: (s.language.split("-")[0] || "en").toLowerCase(),
        label: s.name || s.language || `Subtitle ${i + 1}`,
        default: i === english,
      }));
      return {
        sources: [{ url: proxied("m3u8", player.manifest, origin, audio), type: "hls", quality: server.name || "auto" }],
        // The stream carries ~8 audio languages; play only Japanese (sub) or English (dub).
        audioLang: audio === "dub" ? "en" : "ja",
        // Dub streams carry their own audio; subtitles are still offered.
        subtitles,
      };
    }
    return null;
  },
};
