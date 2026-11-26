"use client";

import Hls from "hls.js";
import type Plyr from "plyr";
import "plyr/dist/plyr.css";
import { useEffect, useRef, useState } from "react";
import type { Stream } from "@/lib/sources/types";

// Video player built on Plyr (controls, captions, settings, keyboard) with
// hls.js for adaptive streams. The <video> element is created imperatively,
// because Plyr rewraps it in its own markup that React must not touch.

type SubtitleSettings = {
  fontSize: number;
  textColor: string;
  backgroundColor: string;
  backgroundOpacity: number;
  outlineWidth: number;
  bottomOffset: number;
  delay: number;
};

type Props = {
  stream: Stream;
  poster?: string;
  /** Seconds to resume from. */
  startAt?: number;
  autoSkip: boolean;
  autoplayNext: boolean;
  hasNext: boolean;
  onNext: () => void;
  onProgress: (time: number, duration: number) => void;
};

const DEFAULT_SUBTITLE_SETTINGS: SubtitleSettings = {
  fontSize: 18,
  textColor: "#ffffff",
  backgroundColor: "#000000",
  backgroundOpacity: 0.6,
  outlineWidth: 2,
  bottomOffset: 8,
  delay: 0,
};

const SUBTITLE_STORAGE_KEY = "animestream:subtitle-settings";

function loadSubtitleSettings(): SubtitleSettings {
  try {
    const saved = window.localStorage.getItem(SUBTITLE_STORAGE_KEY);
    return saved ? { ...DEFAULT_SUBTITLE_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SUBTITLE_SETTINGS;
  } catch {
    return DEFAULT_SUBTITLE_SETTINGS;
  }
}

function hexToRgba(hex: string, alpha: number) {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export default function Player({ stream, poster, startAt, autoSkip, autoplayNext, hasNext, onNext, onProgress }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const plyrRef = useRef<Plyr | null>(null);
  const lastSaved = useRef(0);
  const skipped = useRef({ intro: false, outro: false });
  const appliedDelay = useRef(0);
  const [skip, setSkip] = useState<"intro" | "outro" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nextIn, setNextIn] = useState<number | null>(null);
  const [buffering, setBuffering] = useState(true);
  const [subs, setSubs] = useState<SubtitleSettings>(DEFAULT_SUBTITLE_SETTINGS);
  const [showSubs, setShowSubs] = useState(false);

  const cb = useRef({ onProgress, onNext, autoSkip, autoplayNext, hasNext, stream });
  cb.current = { onProgress, onNext, autoSkip, autoplayNext, hasNext, stream };

  useEffect(() => setSubs(loadSubtitleSettings()), []);

  useEffect(() => {
    try {
      window.localStorage.setItem(SUBTITLE_STORAGE_KEY, JSON.stringify(subs));
    } catch {
      /* private browsing */
    }
  }, [subs]);

  // Build video + Plyr (+ hls.js) for each stream.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let hls: Hls | null = null;

    skipped.current = { intro: false, outro: false };
    lastSaved.current = 0;
    appliedDelay.current = 0;
    setSkip(null);
    setNextIn(null);
    setError(null);
    setBuffering(true);

    const video = document.createElement("video");
    video.setAttribute("playsinline", "");
    video.crossOrigin = "anonymous";
    if (poster) video.poster = poster;
    for (const t of stream.subtitles ?? []) {
      const track = document.createElement("track");
      track.kind = "captions";
      track.src = t.url;
      track.srclang = t.lang;
      track.label = t.label;
      if (t.default) track.default = true;
      video.appendChild(track);
    }
    host.appendChild(video);
    videoRef.current = video;

    const src = stream.sources[0];
    if (!src) {
      setError("No playable source for this episode.");
      return;
    }

    const resume = () => {
      if (startAt && startAt > 5 && (!video.duration || startAt < video.duration - 10)) video.currentTime = startAt;
      video.play().catch(() => {});
    };

    // Load Plyr's code while the stream starts downloading, not before.
    const plyrModule = import("plyr");

    void (async () => {
      // Quality menu: hls.js levels, or one option per mp4 source. 0 = Auto.
      let qualityOptions: number[] = [];
      let levelByHeight = new Map<number, number>();

      if (src.type === "hls" && Hls.isSupported()) {
        hls = new Hls({
          enableWorker: true,
          capLevelToPlayerSize: true,
          // Start on the lightest quality so the first frame comes quickly;
          // auto quality then steps up as bandwidth allows.
          startLevel: 0,
          startFragPrefetch: true,
          maxBufferLength: 30,
          maxMaxBufferLength: 120,
        });
        let recoveries = 0;
        await new Promise<void>((resolve) => {
          hls!.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
            levelByHeight = new Map(data.levels.map((l, i) => [l.height, i]));
            qualityOptions = [0, ...[...levelByHeight.keys()].filter(Boolean).sort((a, b) => b - a)];
            resolve();
          });
          hls!.on(Hls.Events.ERROR, (_e, data) => {
            if (!data.fatal) return;
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls!.startLoad();
            else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && recoveries++ < 2) hls!.recoverMediaError();
            else {
              setError("This stream failed to load. Try another server.");
              hls!.destroy();
              resolve();
            }
          });
          hls!.loadSource(src.url);
          hls!.attachMedia(video);
        });
      } else if (src.type === "hls" && !video.canPlayType("application/vnd.apple.mpegurl")) {
        setError("Your browser can't play this stream.");
        return;
      } else {
        video.src = src.url;
        if (src.type === "mp4" && stream.sources.length > 1) {
          qualityOptions = stream.sources.map((s, i) => parseInt(s.quality ?? "") || i + 1);
        }
      }
      const { default: PlyrCtor } = await plyrModule;
      if (cancelled) return;

      const plyr = new PlyrCtor(video, {
        controls: [
          "play-large", "play", "rewind", "fast-forward", "progress", "current-time", "duration",
          "mute", "volume", "captions", "settings", "pip", "airplay", "fullscreen",
        ],
        settings: ["captions", "quality", "speed"],
        speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 2] },
        seekTime: 10,
        keyboard: { focused: true, global: true },
        tooltips: { controls: true, seek: true },
        captions: { active: true, update: true, language: "auto" },
        invertTime: false,
        // Fullscreen the wrapper so the skip / next-episode overlays stay visible.
        fullscreen: { enabled: true, fallback: true, iosNative: true, container: ".player--plyr" },
        i18n: { qualityLabel: { 0: "Auto" } },
        quality: qualityOptions.length
          ? {
              default: qualityOptions[0],
              options: qualityOptions,
              forced: true,
              onChange: (q: number) => {
                if (hls) hls.currentLevel = q === 0 ? -1 : levelByHeight.get(q) ?? -1;
                else {
                  const i = qualityOptions.indexOf(q);
                  const s = stream.sources[i];
                  if (s && video.src !== s.url) {
                    const t = video.currentTime;
                    video.src = s.url;
                    video.addEventListener("loadedmetadata", () => ((video.currentTime = t), video.play().catch(() => {})), { once: true });
                  }
                }
              },
            }
          : undefined,
      });
      plyrRef.current = plyr;

      video.addEventListener("loadedmetadata", resume, { once: true });
      if (video.readyState >= 1) resume();
    })();

    const onTime = () => {
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
    };
    const onEnded = () => {
      cb.current.onProgress(video.duration, video.duration);
      if (cb.current.autoplayNext && cb.current.hasNext) setNextIn(5);
    };
    const onPause = () => video.duration && cb.current.onProgress(video.currentTime, video.duration);
    const onWaiting = () => setBuffering(true);
    const onReady = () => setBuffering(false);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("ended", onEnded);
    video.addEventListener("pause", onPause);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onReady);
    video.addEventListener("canplay", onReady);

    return () => {
      cancelled = true;
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", onReady);
      video.removeEventListener("canplay", onReady);
      hls?.destroy();
      plyrRef.current?.destroy();
      plyrRef.current = null;
      video.removeAttribute("src");
      video.load();
      host.innerHTML = "";
      videoRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream]);

  // Shift subtitle cues when the delay setting changes (and once tracks load).
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const apply = () => {
      const diff = subs.delay - appliedDelay.current;
      if (!diff) return;
      for (const track of Array.from(video.textTracks)) {
        for (const cue of Array.from(track.cues ?? [])) {
          cue.startTime = Math.max(0, cue.startTime + diff);
          cue.endTime = Math.max(0, cue.endTime + diff);
        }
      }
      appliedDelay.current = subs.delay;
    };
    apply();
    const tracks = Array.from(video.querySelectorAll("track"));
    tracks.forEach((t) => t.addEventListener("load", apply));
    return () => tracks.forEach((t) => t.removeEventListener("load", apply));
  }, [subs.delay, stream]);

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

  // Shortcuts Plyr doesn't have: S skips intro/outro, N plays the next episode.
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
    const video = videoRef.current;
    const range = which === "intro" ? cb.current.stream.intro : cb.current.stream.outro;
    if (!video || !range) return;
    video.currentTime = Math.min(range.end, video.duration - 0.5);
    setSkip(null);
  }

  const update = (p: Partial<SubtitleSettings>) => setSubs((s) => ({ ...s, ...p }));
  const subStyle = {
    "--sub-size": `${subs.fontSize}px`,
    "--sub-color": subs.textColor,
    "--sub-bg": hexToRgba(subs.backgroundColor, subs.backgroundOpacity),
    "--sub-outline": `${subs.outlineWidth}px`,
    "--sub-bottom": `${subs.bottomOffset}%`,
  } as React.CSSProperties;

  return (
    <div className="player-wrap">
      <div className="player player--plyr" style={subStyle}>
        <div ref={hostRef} className="player__host" />

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

        {buffering && !error ? <div className="spinner player__spinner player__spinner--center" /> : null}

        {error ? <div className="player__error">{error}</div> : null}

        {stream.subtitles?.length ? (
          <button className="player__subs-btn" onClick={() => setShowSubs((s) => !s)} title="Subtitle style">
            Aa
          </button>
        ) : null}
        {showSubs ? (
          <div className="player__subs">
            <div className="player__subs-head">
              <strong>Subtitle style</strong>
              <button className="link-btn" onClick={() => setSubs(DEFAULT_SUBTITLE_SETTINGS)}>
                Reset
              </button>
              <button className="link-btn" onClick={() => setShowSubs(false)}>
                Close
              </button>
            </div>
            <label>
              Size <input type="range" min={12} max={40} value={subs.fontSize} onChange={(e) => update({ fontSize: +e.target.value })} />
            </label>
            <label>
              Text <input type="color" value={subs.textColor} onChange={(e) => update({ textColor: e.target.value })} />
            </label>
            <label>
              Background <input type="color" value={subs.backgroundColor} onChange={(e) => update({ backgroundColor: e.target.value })} />
            </label>
            <label>
              Opacity
              <input type="range" min={0} max={1} step={0.05} value={subs.backgroundOpacity} onChange={(e) => update({ backgroundOpacity: +e.target.value })} />
            </label>
            <label>
              Outline <input type="range" min={0} max={4} value={subs.outlineWidth} onChange={(e) => update({ outlineWidth: +e.target.value })} />
            </label>
            <label>
              Position <input type="range" min={0} max={40} value={subs.bottomOffset} onChange={(e) => update({ bottomOffset: +e.target.value })} />
            </label>
            <label>
              Delay {subs.delay > 0 ? "+" : ""}
              {subs.delay.toFixed(1)}s
              <input type="range" min={-10} max={10} step={0.1} value={subs.delay} onChange={(e) => update({ delay: +e.target.value })} />
            </label>
          </div>
        ) : null}
      </div>
    </div>
  );
}
