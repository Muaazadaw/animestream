import type { AnimeRef, EpisodeInfo, SourceProvider, Stream, SubtitleTrack } from "./types";

const BASE_URL = (process.env.ANIFLOW_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

type AniFlowPlayResponse = {
  success?: boolean;
  streamUrl?: string;
  url?: string;
  m3u8?: string;
  fullM3u8?: string;
  subtitles?: Array<{
    url?: string;
    subtitleUrl?: string;
    language?: string;
    label?: string;
    default?: boolean;
    isDefault?: boolean;
  }>;
  intro?: { start: number; end: number } | null;
  outro?: { start: number; end: number } | null;
};

function episodeCount(anime: AnimeRef): number {
  return anime.airedEpisodes > 0 ? anime.airedEpisodes : (anime.totalEpisodes ?? 0);
}

export const aniflowProvider: SourceProvider = {
  id: "aniflow",
  name: "AniFlow",

  isEnabled() {
    return Boolean(BASE_URL);
  },

  async getEpisodes(anime: AnimeRef): Promise<EpisodeInfo[]> {
    const count = episodeCount(anime);

    if (count <= 0) {
      return [];
    }

    return Array.from({ length: count }, (_, index) => ({
      number: index + 1,
      title: `Episode ${index + 1}`,
    }));
  },

  async getStream(anime: AnimeRef, episode: number): Promise<Stream | null> {
    const url = `${BASE_URL}/api/play?anilistId=${encodeURIComponent(
      anime.id,
    )}&episode=${encodeURIComponent(episode)}&audio=sub`;

    const response = await fetch(url, {
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as AniFlowPlayResponse;
    const streamUrl = data.streamUrl ?? data.url ?? data.m3u8 ?? data.fullM3u8;

    if (!data.success || !streamUrl) {
      return null;
    }

    const absoluteStreamUrl = streamUrl.startsWith("http")
      ? streamUrl
      : `${BASE_URL}${streamUrl}`;

    const subtitles: SubtitleTrack[] = (data.subtitles ?? [])
      .map((subtitle, index) => {
        const subtitleUrl = subtitle.url ?? subtitle.subtitleUrl;

        if (!subtitleUrl) {
          return null;
        }

        return {
          url: subtitleUrl.startsWith("http") ? subtitleUrl : `${BASE_URL}${subtitleUrl}`,
          lang: "en",
          label: subtitle.label ?? subtitle.language ?? `English ${index + 1}`,
          default: subtitle.default ?? subtitle.isDefault ?? index === 0,
        };
      })
      .filter((subtitle): subtitle is SubtitleTrack => subtitle !== null);

    return {
      sources: [
        {
          url: absoluteStreamUrl,
          type: "hls",
          quality: "auto",
        },
      ],
      subtitles,
      intro: data.intro ?? undefined,
      outro: data.outro ?? undefined,
    };
  },
};