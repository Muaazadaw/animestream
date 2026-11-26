import type {
  AnimeRef,
  Audio,
  EpisodeInfo,
  SourceProvider,
  Stream,
  SubtitleTrack,
} from "./types";

const BASE_URL = (
  process.env.ANIVEXA_BASE_URL ?? ""
).replace(/\/$/, "");

// Flixcloud playlists are scrambled with a per-stream key and need flixcloud's
// referer, which browsers can't send. The AniFlow API's proxy unscrambles them,
// adds the headers, and converts .ass subtitles to WebVTT.
const PROXY_URL = (
  process.env.ANIFLOW_BASE_URL ?? ""
).replace(/\/$/, "");

function proxiedStreamUrl(url: string, key: string | undefined, audio: Audio): string {
  if (!PROXY_URL) return url;
  const params = new URLSearchParams({
    url,
    pk: key ?? "",
    audio: audio === "dub" ? "english" : "japanese",
  });
  return `${PROXY_URL}/api/proxy/m3u8?${params}`;
}

function proxiedSubtitleUrl(url: string): string {
  return PROXY_URL ? `${PROXY_URL}/api/proxy/subtitles?url=${encodeURIComponent(url)}` : url;
}

type AnivexaEpisode = {
  id?: string;
  audio?: string;
  number?: number;
  title?: string;
  image?: string;
  filler?: boolean;
};

type AnivexaEpisodesResponse = {
  episodes?: {
    sub?: AnivexaEpisode[];
    dub?: AnivexaEpisode[];
  };
};

type AnivexaSubtitle = {
  url?: string;
  language?: string;
  format?: string;
  default?: boolean;
};

type AnivexaPlayResponse = {
  stream_url?: string;
  streams?: Array<{
    server?: string;
    audio?: string;
    url?: string;
    type?: string;
    key?: string;
    playlist_key?: string;
    subtitles?: AnivexaSubtitle[];
    intro?: { start: number; end: number } | null;
    outro?: { start: number; end: number } | null;
  }>;
  subtitles?: AnivexaSubtitle[];
  intro?: { start: number; end: number } | null;
  outro?: { start: number; end: number } | null;
};

function episodeCount(anime: AnimeRef): number {
  return anime.airedEpisodes > 0
    ? anime.airedEpisodes
    : (anime.totalEpisodes ?? 0);
}

function normalizeSubtitle(
  subtitle: AnivexaSubtitle,
  index: number,
): SubtitleTrack | null {
  if (!subtitle.url) return null;

  const language = subtitle.language?.toLowerCase() ?? "";
  const isEnglish =
    language.includes("english") || language.startsWith("en");
  const isForced = language.includes("forced");

  return {
    url: proxiedSubtitleUrl(subtitle.url),
    lang: "en",
    label: subtitle.language ?? `English ${index + 1}`,
    default:
      Boolean(subtitle.default) ||
      (isEnglish && !isForced && index === 0),
  };
}

export const anivexaProvider: SourceProvider = {
  id: "anivexa",
  name: "Anivexa",

  audio: ["sub", "dub"],

  tags: ["s-sub", "multi-server"],

  isEnabled() {
    return Boolean(BASE_URL);
  },

  async getEpisodes(anime: AnimeRef): Promise<EpisodeInfo[]> {
    const count = episodeCount(anime);

    if (count <= 0) {
      return [];
    }

    const url = `${BASE_URL}/episodes/${encodeURIComponent(anime.id)}`;

    const response = await fetch(url, {
      cache: "no-store",
    });

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as AnivexaEpisodesResponse;

    const subEpisodes = data.episodes?.sub ?? [];
    const dubEpisodes = data.episodes?.dub ?? [];

    const episodes: EpisodeInfo[] = [];

    for (let number = 1; number <= count; number += 1) {
      const sub = subEpisodes.find(
        (episode) => episode.number === number,
      );

      const dub = dubEpisodes.find(
        (episode) => episode.number === number,
      );

      episodes.push({
        number,
        title: sub?.title ?? dub?.title ?? `Episode ${number}`,
        thumbnail: sub?.image ?? dub?.image,
        filler: sub?.filler ?? dub?.filler,
        dub: Boolean(dub),
      });
    }

    return episodes;
  },

  async getStream(
    anime: AnimeRef,
    episode: number,
    audio: Audio = "sub",
  ): Promise<Stream | null> {
    const provider = "reanime";

    const url =
      `${BASE_URL}/watch/${provider}/` +
      `${encodeURIComponent(anime.id)}/` +
      `${audio}/${provider}-${encodeURIComponent(episode)}`;

    const response = await fetch(url, {
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as AnivexaPlayResponse;

    const streams = data.streams ?? [];

    const matchingStreams = streams.filter(
      (stream) => stream.audio === audio && stream.url,
    );

    const usableStreams = matchingStreams.length
      ? matchingStreams
      : streams.filter((stream) => stream.url);

    if (!usableStreams.length && !data.stream_url) {
      return null;
    }

    const sources = usableStreams.length
      ? usableStreams.map((stream, index) => ({
          url:
            stream.type === "mp4"
              ? (stream.url as string)
              : proxiedStreamUrl(stream.url as string, stream.playlist_key ?? stream.key, audio),
          type:
            stream.type === "mp4"
              ? ("mp4" as const)
              : ("hls" as const),
          quality: stream.server ?? `Server ${index + 1}`,
        }))
      : [
          {
            url: proxiedStreamUrl(data.stream_url as string, undefined, audio),
            type: "hls" as const,
            quality: "auto",
          },
        ];

    const subtitleSource =
      usableStreams[0]?.subtitles ?? data.subtitles ?? [];

    const subtitleTracks = subtitleSource
      .map((subtitle, index) => normalizeSubtitle(subtitle, index))
      .filter((subtitle): subtitle is SubtitleTrack => subtitle !== null);

    return {
      sources,
      subtitles: subtitleTracks,
      intro:
        usableStreams[0]?.intro ??
        data.intro ??
        undefined,
      outro:
        usableStreams[0]?.outro ??
        data.outro ??
        undefined,
    };
  },
};