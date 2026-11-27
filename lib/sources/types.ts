// The contract every video source implements. The site never cares where a
// stream comes from: it asks each enabled provider for an episode list and,
// when the viewer presses play, for a playable stream URL.

export type AnimeRef = {
  /** AniList media id. Use it as the key when mapping to your own catalog. */
  id: number;
  title: string;
  /** Total episodes announced (null if unknown). */
  totalEpisodes: number | null;
  /** Episodes that have aired so far. */
  airedEpisodes: number;
};

export type EpisodeInfo = {
  number: number;
  title?: string;
  thumbnail?: string;
  /** true for filler episodes, if your source knows. */
  filler?: boolean;
  /** true if a dubbed version of this episode exists on this source. */
  dub?: boolean;
};

export type Audio = "sub" | "dub";

export type StreamSource = {
  url: string;
  type: "hls" | "mp4";
  /** e.g. "1080p". HLS streams usually carry their own quality ladder instead. */
  quality?: string;
};

export type SubtitleTrack = {
  url: string;
  /** BCP-47 language code, e.g. "en". */
  lang: string;
  label: string;
  default?: boolean;
};

export type TimeRange = { start: number; end: number };

export type Stream = {
  sources: StreamSource[];
  subtitles?: SubtitleTrack[];
  intro?: TimeRange;
  outro?: TimeRange;
};

export interface SourceProvider {
  /** Stable id used in URLs, e.g. "self-hosted". */
  id: string;
  /** Name shown on the server picker. */
  name: string;
  /** Audio tracks this provider can serve. Defaults to ["sub"]. */
  audio?: Audio[];
  /** Short badges on the server picker, e.g. "s-sub" (soft subs), "h-sub" (hard subs), "dl". */
  tags?: string[];
  /** Return false to hide the provider (e.g. when its config is missing). */
  isEnabled(): boolean;
  /** Episodes this provider has for the given anime. Return [] if none. */
  getEpisodes(anime: AnimeRef): Promise<EpisodeInfo[]>;
  /** A playable stream for one episode, or null if unavailable. */
 getStream(
  anime: AnimeRef,
  episode: number,
  audio?: Audio,
  provider?: string,
): Promise<Stream | null>;
}