import type { SourceProvider, StreamSource } from "./types";

// Plays openly licensed sample films (Blender Foundation, CC BY) for every
// episode so the player can be tried end to end. Disable it with
// ENABLE_DEMO_SOURCE=false once you add a real source.

const SAMPLES: StreamSource[][] = [
  // Big Buck Bunny, multi-bitrate HLS test stream hosted by Mux.
  [{ type: "hls", url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" }],
  // Tears of Steel, multi-bitrate HLS demo hosted by Unified Streaming.
  [
    {
      type: "hls",
      url: "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8",
    },
  ],
  // Sintel, 10-second MP4 clips in three qualities (shows the MP4 quality switch).
  [
    { type: "mp4", quality: "1080p", url: "https://test-videos.co.uk/vids/sintel/mp4/h264/1080/Sintel_1080_10s_5MB.mp4" },
    { type: "mp4", quality: "720p", url: "https://test-videos.co.uk/vids/sintel/mp4/h264/720/Sintel_720_10s_1MB.mp4" },
    { type: "mp4", quality: "360p", url: "https://test-videos.co.uk/vids/sintel/mp4/h264/360/Sintel_360_10s_1MB.mp4" },
  ],
];

export const demoProvider: SourceProvider = {
  id: "demo",
  name: "Demo (sample video)",

  isEnabled() {
    return process.env.ENABLE_DEMO_SOURCE !== "false";
  },

  async getEpisodes(anime) {
    const count = Math.min(anime.airedEpisodes || anime.totalEpisodes || 0, 500);
    return Array.from({ length: count }, (_, i) => ({ number: i + 1, title: `Episode ${i + 1}` }));
  },

  async getStream(anime, episode) {
    const sources = SAMPLES[(episode - 1) % SAMPLES.length];
    // Fake markers so the skip-intro / skip-outro buttons can be tried
    // (only on the full-length HLS films; the MP4 clips are 10 s long).
    const long = sources[0].type === "hls";
    return {
      sources,
      intro: long ? { start: 3, end: 20 } : undefined,
      outro: long ? { start: 540, end: 580 } : undefined,
    };
  },
};
