import type { EpisodeInfo, SourceProvider, Stream } from "./types";

// Reads episodes from files you host yourself (your own server, S3, a CDN...).
//
// Set SELF_HOSTED_BASE_URL, then put one manifest per show at
//   {SELF_HOSTED_BASE_URL}/{anilistId}/episodes.json
//
// Manifest format:
// {
//   "episodes": [
//     {
//       "number": 1,
//       "title": "The Beginning",
//       "thumbnail": "https://.../ep1.jpg",
//       "sources": [{ "url": "https://.../ep1/master.m3u8", "type": "hls" }],
//       "subtitles": [{ "url": "https://.../ep1/en.vtt", "lang": "en", "label": "English", "default": true }],
//       "intro": { "start": 90, "end": 180 },
//       "outro": { "start": 1320, "end": 1410 }
//     }
//   ]
// }
//
// Relative URLs inside the manifest are resolved against the manifest's folder.

type ManifestEpisode = EpisodeInfo & Stream;
type Manifest = { episodes: ManifestEpisode[] };

function base() {
  return process.env.SELF_HOSTED_BASE_URL?.replace(/\/+$/, "");
}

async function loadManifest(anilistId: number): Promise<Manifest | null> {
  const root = base();
  if (!root) return null;
  const url = `${root}/${anilistId}/episodes.json`;
  const res = await fetch(url, { next: { revalidate: 300 } }).catch(() => null);
  if (!res || !res.ok) return null;
  const data = (await res.json().catch(() => null)) as Manifest | null;
  if (!data || !Array.isArray(data.episodes)) return null;

  const resolve = (u: string) => new URL(u, url).toString();
  for (const ep of data.episodes) {
    ep.sources = (ep.sources ?? []).map((s) => ({ ...s, url: resolve(s.url) }));
    ep.subtitles = ep.subtitles?.map((s) => ({ ...s, url: resolve(s.url) }));
    if (ep.thumbnail) ep.thumbnail = resolve(ep.thumbnail);
  }
  return data;
}

export const selfHostedProvider: SourceProvider = {
  id: "self-hosted",
  name: "Main server",

  isEnabled() {
    return Boolean(base());
  },

  async getEpisodes(anime) {
    const m = await loadManifest(anime.id);
    if (!m) return [];
    return m.episodes
      .map(({ number, title, thumbnail, filler }) => ({ number, title, thumbnail, filler }))
      .sort((a, b) => a.number - b.number);
  },

  async getStream(anime, episode) {
    const m = await loadManifest(anime.id);
    const ep = m?.episodes.find((e) => e.number === episode);
    if (!ep || ep.sources.length === 0) return null;
    return { sources: ep.sources, subtitles: ep.subtitles, intro: ep.intro, outro: ep.outro };
  },
};
