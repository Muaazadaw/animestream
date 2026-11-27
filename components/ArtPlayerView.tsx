"use client";

import type Artplayer from "artplayer";
import Hls from "hls.js";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { setUpscaleMode, startAnime4K, UPSCALE_MODES, type UpscaleMode } from "@/lib/anime4k";
import { hlsBuffers, perfTier } from "@/lib/device";
import type { Stream } from "@/lib/sources/types";

// The same player features as Player.tsx (Plyr), built on ArtPlayer
// (https://artplayer.org): HLS with server fallback, quality, subtitles,
// resume, skip intro/outro, next-episode countdown, progress and Anime4K.
// Overlays are rendered into an ArtPlayer layer so they stay in fullscreen.

type Props = {
  stream: Stream;
  poster?: string;
  startAt?: number;
  autoSkip: boolean;
  autoplayNext: boolean;
  autoStart?: boolean;
  hasNext: boolean;
  onNext: () => void;
  onProgress: (time: number, duration: number) => void;
  upscale?: UpscaleMode;
};

// Fansub look, like the Plyr captions: bold white text with a black outline.
const SUBTITLE_STYLE = {
  color: "#fff",
  fontWeight: "700",
  fontSize: "clamp(16px, 3.2cqw, 34px)",
  textShadow: "-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, 0 2px 0 #000, 0 -2px 0 #000",
} as Partial<CSSStyleDeclaration>;

export default function ArtPlayerView({
  stream,
  poster,
  startAt,
  autoSkip,
  autoplayNext,
  autoStart = true,
  hasNext,
  onNext,
  onProgress,
  upscale = "off",
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const artRef = useRef<Artplayer | null>(null);
  const [layer, setLayer] = useState<HTMLElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [skip, setSkip] = useState<"intro" | "outro" | null>(null);
  const [nextIn, setNextIn] = useState<number | null>(null);
  const [a4k, setA4k] = useState<{ on: boolean; error: string | null }>({ on: false, error: null });
  const skipped = useRef({ intro: false, outro: false });
  const lastSaved = useRef(0);
  const cb = useRef({ onProgress, onNext, autoSkip, autoplayNext, hasNext, stream, upscale });
  cb.current = { onProgress, onNext, autoSkip, autoplayNext, hasNext, stream, upscale };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let hls: Hls | null = null;
    let art: Artplayer | null = null;
    skipped.current = { intro: false, outro: false };
    lastSaved.current = 0;
    setSkip(null);
    setNextIn(null);
    setError(null);
    setLayer(null);

    const src = stream.sources[0];
    if (!src) {
      setError("No playable source for this episode.");
      return;
    }
    const subs = stream.subtitles ?? [];
    const firstSub = subs.find((s) => s.default) ?? subs[0];

    void (async () => {
      const { default: Art } = await import("artplayer");
      if (cancelled) return;

      art = new Art({
        container: host,
        url: src.url,
        type: src.type === "hls" ? "m3u8" : "mp4",
        poster: poster ?? "",
        theme: "#8b5cf6",
        volume: 1,
        autoplay: false,
        setting: true,
        playbackRate: true,
        aspectRatio: true,
        fullscreen: true,
        fullscreenWeb: true,
        pip: true,
        airplay: true,
        hotkey: true,
        mutex: true,
        backdrop: true,
        playsInline: true,
        autoOrientation: true,
        fastForward: true,
        lock: true,
        gesture: true,
        miniProgressBar: true,
        subtitleOffset: true,
        moreVideoAttr: { crossOrigin: "anonymous" },
        quality:
          src.type === "mp4" && stream.sources.length > 1
            ? stream.sources.map((s, i) => ({ html: s.quality ?? `Source ${i + 1}`, url: s.url, default: i === 0 }))
            : [],
        // ArtPlayer wants an object here even with no subtitles.
        subtitle: firstSub ? { url: firstSub.url, type: "vtt", encoding: "utf-8", style: SUBTITLE_STYLE } : {},
        settings: [
          ...(subs.length
            ? [
                {
                  name: "subtitles",
                  html: "Subtitles",
                  tooltip: firstSub?.label ?? "Off",
                  selector: [
                    { html: "Off", off: true },
                    ...subs.map((s) => ({ html: s.label, url: s.url, default: s === firstSub })),
                  ],
                  onSelect(this: Artplayer, item: { html: string; url?: string; off?: boolean }) {
                    if (item.off) this.subtitle.show = false;
                    else {
                      this.subtitle.show = true;
                      void this.subtitle.switch(item.url!, { name: item.html });
                    }
                    return item.html;
                  },
                },
              ]
            : []),
          ...(perfTier() === "low" ? [] : [
          {
            name: "anime4k",
            html: "Anime4K",
            tooltip: UPSCALE_MODES.find((m) => m.id === cb.current.upscale)?.label ?? "Off",
            selector: UPSCALE_MODES.map((m) => ({ html: m.label, mode: m.id, default: m.id === cb.current.upscale })),
            onSelect(item: { html: string; mode: UpscaleMode }) {
              setUpscaleMode(item.mode);
              return item.html;
            },
          },
          ]),
        ] as unknown as Artplayer["option"]["settings"],
        customType: {
          m3u8(video: HTMLVideoElement, url: string, player: Artplayer) {
            if (!Hls.isSupported()) {
              if (video.canPlayType("application/vnd.apple.mpegurl")) video.src = url;
              else setError("Your browser can't play this stream.");
              return;
            }
            hls?.destroy();
            hls = new Hls({ enableWorker: true, capLevelToPlayerSize: true, startLevel: 0, ...hlsBuffers() });
            let retries = 0;
            let recoveries = 0;
            let srcIndex = 0;
            hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
              const heights = [...new Set(data.levels.map((l) => l.height).filter(Boolean))].sort((a, b) => b - a);
              if (heights.length < 2) return;
              player.setting.update({
                name: "quality",
                html: "Quality",
                tooltip: "Auto",
                selector: [
                  { html: "Auto", default: true, level: -1 },
                  ...heights.map((h) => ({ html: `${h}p`, level: data.levels.findIndex((l) => l.height === h) })),
                ],
                onSelect(item: { html: string; level: number }) {
                  if (hls) hls.currentLevel = item.level;
                  return item.html;
                },
              } as unknown as Parameters<Artplayer["setting"]["update"]>[0]);
            });
            hls.on(Hls.Events.ERROR, (_e, data) => {
              if (!data.fatal || !hls) return;
              const unreadable =
                data.details === Hls.ErrorDetails.MANIFEST_PARSING_ERROR || data.details === Hls.ErrorDetails.LEVEL_PARSING_ERROR;
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR && !unreadable && retries++ < 2) hls.startLoad();
              else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && recoveries++ < 2) hls.recoverMediaError();
              else if (srcIndex < stream.sources.length - 1) {
                // Fall back to the stream's next server before giving up.
                srcIndex++;
                retries = 0;
                recoveries = 0;
                hls.loadSource(stream.sources[srcIndex].url);
              } else {
                setError("This stream failed to load. Try another server.");
                hls.destroy();
                hls = null;
              }
            });
            hls.loadSource(url);
            hls.attachMedia(video);
          },
        },
      });
      artRef.current = art;

      // Our overlays (skip, next episode, Anime4K) live in a layer so fullscreen keeps them.
      const el = document.createElement("div");
      el.className = "artx";
      art.layers.add({ name: "mayoi", html: el, style: { position: "absolute", inset: "0", pointerEvents: "none", zIndex: "30" } });
      setLayer(el);

      const video = art.video;
      art.on("ready", () => {
        if (startAt && startAt > 5 && (!video.duration || startAt < video.duration - 10)) video.currentTime = startAt;
        if (autoStart) void art?.play()?.catch?.(() => {});
      });

      video.addEventListener("timeupdate", () => {
        if (!video.duration) return;
        const time = video.currentTime;
        const s = cb.current.stream;
        const inRange = (r?: { start: number; end: number }) => !!r && time >= r.start && time < r.end - 1;
        let which: "intro" | "outro" | null = inRange(s.intro) ? "intro" : inRange(s.outro) ? "outro" : null;
        if (which && cb.current.autoSkip && !skipped.current[which]) {
          skipped.current[which] = true;
          doSkip(which);
          which = null;
        }
        setSkip(which);
        if (Math.abs(time - lastSaved.current) >= 5) {
          lastSaved.current = time;
          cb.current.onProgress(time, video.duration);
        }
      });
      video.addEventListener("ended", () => {
        cb.current.onProgress(video.duration, video.duration);
        if (cb.current.autoplayNext && cb.current.hasNext) setNextIn(5);
      });
      video.addEventListener("pause", () => video.duration && cb.current.onProgress(video.currentTime, video.duration));
    })();

    return () => {
      cancelled = true;
      hls?.destroy();
      art?.destroy(true);
      artRef.current = null;
      setLayer(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream]);

  // Anime4K, once the player is up.
  useEffect(() => {
    const video = artRef.current?.video;
    setA4k({ on: false, error: null });
    if (!video || !layer || upscale === "off") return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    const report = (error: string) => !cancelled && setA4k({ on: false, error });
    startAnime4K(video, upscale, report)
      .then((s) => (cancelled ? s() : ((stop = s), setA4k({ on: true, error: null }))))
      .catch((e: Error) => report(e.message));
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [upscale, layer]);

  useEffect(() => {
    if (!a4k.error) return;
    const t = setTimeout(() => setA4k((s) => ({ ...s, error: null })), 6000);
    return () => clearTimeout(t);
  }, [a4k.error]);

  // Keep the Anime4K row's label in step when it's changed elsewhere.
  useEffect(() => {
    const art = artRef.current;
    const label = UPSCALE_MODES.find((m) => m.id === upscale)?.label ?? "Off";
    const item = art?.setting.find("anime4k");
    if (item?.$tooltip) item.$tooltip.textContent = label;
  }, [upscale, layer]);

  // Next-episode countdown.
  useEffect(() => {
    if (nextIn === null) return;
    if (nextIn <= 0) {
      setNextIn(null);
      cb.current.onNext();
      return;
    }
    const timer = setTimeout(() => setNextIn((n) => (n === null ? null : n - 1)), 1000);
    return () => clearTimeout(timer);
  }, [nextIn]);

  // S skips intro/outro, N plays the next episode (ArtPlayer handles the rest).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "s" && skip) doSkip(skip);
      if (k === "n" && cb.current.hasNext) cb.current.onNext();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  function doSkip(which: "intro" | "outro") {
    const video = artRef.current?.video;
    const range = which === "intro" ? cb.current.stream.intro : cb.current.stream.outro;
    if (!video || !range) return;
    video.currentTime = Math.min(range.end, video.duration - 0.5);
    setSkip(null);
  }

  return (
    <div className="player-wrap">
      <div className="player player--art">
        <div ref={hostRef} className="player__host" />
        {error ? <div className="player__error">{error}</div> : null}
      </div>
      {layer
        ? createPortal(
            <>
              {skip ? (
                <button className="player__skip" onClick={() => doSkip(skip)}>
                  Skip {skip}
                </button>
              ) : null}
              {nextIn !== null ? (
                <div className="player__next">
                  Next episode in {nextIn}…
                  <div>
                    <button className="btn btn--primary btn--sm" onClick={() => (setNextIn(null), cb.current.onNext())}>
                      Play now
                    </button>
                    <button className="btn btn--sm" onClick={() => setNextIn(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
              {a4k.on ? <span className="player__a4k">Anime4K {upscale}</span> : null}
              {a4k.error ? <div className="player__a4k-error">{a4k.error}</div> : null}
            </>,
            layer,
          )
        : null}
    </div>
  );
}
