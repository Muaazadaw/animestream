"use client";

import Hls from "hls.js";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Stream } from "@/lib/sources/types";

type Quality = { id: number; label: string };

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

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export default function Player({ stream, poster, startAt, autoSkip, autoplayNext, hasNext, onNext, onProgress }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const lastSaved = useRef(0);
  const skipped = useRef({ intro: false, outro: false });

  const [qualities, setQualities] = useState<Quality[]>([]);
  const [quality, setQuality] = useState(-1); // -1 = auto (HLS) / first source (MP4)
  const [activeLevel, setActiveLevel] = useState<string>("");
  const [speed, setSpeed] = useState(1);
  const [skip, setSkip] = useState<"intro" | "outro" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [buffering, setBuffering] = useState(true);
  const [nextIn, setNextIn] = useState<number | null>(null);

  // Keep latest callbacks without re-running the load effect.
  const cb = useRef({ onProgress, onNext, autoSkip, autoplayNext, hasNext });
  cb.current = { onProgress, onNext, autoSkip, autoplayNext, hasNext };

  /** Attach a source URL to the <video>, via hls.js when needed. */
  const load = useCallback(
    (srcIndex: number, resumeAt: number | undefined) => {
      const video = videoRef.current;
      if (!video) return;
      hlsRef.current?.destroy();
      hlsRef.current = null;
      setError(null);
      setBuffering(true);

      const src = stream.sources[srcIndex] ?? stream.sources[0];
      if (!src) {
        setError("No playable source for this episode.");
        return;
      }

      const seekAndPlay = () => {
        if (resumeAt && resumeAt > 5 && (!video.duration || resumeAt < video.duration - 10)) video.currentTime = resumeAt;
        video.playbackRate = speed;
        video.play().catch(() => {
          /* autoplay blocked: user presses play */
        });
      };

      if (src.type === "hls" && Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true, capLevelToPlayerSize: true });
        hlsRef.current = hls;
        let mediaRecoveries = 0;
        hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
          const ladder = data.levels
            .map((l, id) => ({ id, label: l.height ? `${l.height}p` : `${Math.round(l.bitrate / 1000)} kbps` }))
            .sort((a, b) => parseInt(b.label) - parseInt(a.label));
          setQualities(ladder);
          setQuality(-1);
          video.addEventListener("loadedmetadata", seekAndPlay, { once: true });
        });
        hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
          const l = hls.levels[data.level];
          setActiveLevel(l?.height ? `${l.height}p` : "");
        });
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRecoveries++ < 2) {
            hls.recoverMediaError();
          } else {
            setError("This stream failed to load. Try another server.");
            hls.destroy();
          }
        });
        hls.loadSource(src.url);
        hls.attachMedia(video);
      } else {
        // MP4, or Safari's native HLS.
        if (src.type === "hls" && !video.canPlayType("application/vnd.apple.mpegurl")) {
          setError("Your browser can't play this stream.");
          return;
        }
        if (src.type === "mp4") {
          setQualities(
            stream.sources.length > 1 ? stream.sources.map((s, id) => ({ id, label: s.quality ?? `Source ${id + 1}` })) : [],
          );
        } else {
          setQualities([]);
        }
        setActiveLevel(src.quality ?? "");
        video.src = src.url;
        video.addEventListener("loadedmetadata", seekAndPlay, { once: true });
      }
    },
    // speed is applied at load time only; changes are applied by its own effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stream],
  );

  // New stream: reset state and load the first source.
  useEffect(() => {
    skipped.current = { intro: false, outro: false };
    lastSaved.current = 0;
    setSkip(null);
    setNextIn(null);
    setQuality(-1);
    load(0, startAt);
    const video = videoRef.current;
    return () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
      if (video) {
        video.removeAttribute("src");
        video.load();
      }
    };
    // startAt is read once per stream on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed;
  }, [speed]);

  function changeQuality(id: number) {
    setQuality(id);
    const hls = hlsRef.current;
    if (hls) {
      hls.currentLevel = id; // -1 = auto
    } else if (stream.sources[id]) {
      const t = videoRef.current?.currentTime ?? 0;
      load(id, t);
    }
  }

  function onTimeUpdate() {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    const t = v.currentTime;
    const inRange = (r?: { start: number; end: number }) => !!r && t >= r.start && t < r.end - 1;

    let which: "intro" | "outro" | null = null;
    if (inRange(stream.intro)) which = "intro";
    else if (inRange(stream.outro)) which = "outro";

    if (which && cb.current.autoSkip && !skipped.current[which]) {
      skipped.current[which] = true;
      doSkip(which);
      which = null;
    }
    setSkip(which);

    if (Math.abs(t - lastSaved.current) >= 5) {
      lastSaved.current = t;
      cb.current.onProgress(t, v.duration);
    }
  }

  function doSkip(which: "intro" | "outro") {
    const v = videoRef.current;
    const r = which === "intro" ? stream.intro : stream.outro;
    if (!v || !r) return;
    v.currentTime = Math.min(r.end, v.duration - 0.5);
    setSkip(null);
  }

  function onEnded() {
    const v = videoRef.current;
    if (v) cb.current.onProgress(v.duration, v.duration);
    if (cb.current.autoplayNext && cb.current.hasNext) setNextIn(5);
  }

  // "Next episode in N…" countdown.
  useEffect(() => {
    if (nextIn === null) return;
    if (nextIn <= 0) {
      setNextIn(null);
      cb.current.onNext();
      return;
    }
    const t = setTimeout(() => setNextIn((n) => (n === null ? null : n - 1)), 1000);
    return () => clearTimeout(t);
  }, [nextIn]);

  const toggleFullscreen = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else el.requestFullscreen?.().catch(() => {});
  }, []);

  // Keyboard shortcuts.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.ctrlKey || e.metaKey || e.altKey) return;
      const v = videoRef.current;
      if (!v) return;
      switch (e.key.toLowerCase()) {
        case " ":
        case "k":
          e.preventDefault();
          if (v.paused) v.play().catch(() => {});
          else v.pause();
          break;
        case "arrowleft":
          e.preventDefault();
          v.currentTime = Math.max(0, v.currentTime - 5);
          break;
        case "arrowright":
          e.preventDefault();
          v.currentTime = Math.min(v.duration || Infinity, v.currentTime + 5);
          break;
        case "j":
          v.currentTime = Math.max(0, v.currentTime - 10);
          break;
        case "l":
          v.currentTime = Math.min(v.duration || Infinity, v.currentTime + 10);
          break;
        case "m":
          v.muted = !v.muted;
          break;
        case "f":
          toggleFullscreen();
          break;
        case "s":
          if (skip) doSkip(skip);
          break;
        case "n":
          if (cb.current.hasNext) cb.current.onNext();
          break;
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip, toggleFullscreen]);

  const needsCors = (stream.subtitles?.length ?? 0) > 0;

  return (
    <div className="player-wrap">
      <div className="player" ref={wrapRef}>
        <video
          ref={videoRef}
          poster={poster}
          controls
          playsInline
          controlsList="nofullscreen nodownload"
          crossOrigin={needsCors ? "anonymous" : undefined}
          onTimeUpdate={onTimeUpdate}
          onEnded={onEnded}
          onError={() => {
            // hls.js reports its own errors; this catches MP4 / native HLS failures.
            if (!hlsRef.current && videoRef.current?.getAttribute("src")) {
              setError("This video failed to load. Try another quality or server.");
            }
          }}
          onWaiting={() => setBuffering(true)}
          onPlaying={() => setBuffering(false)}
          onCanPlay={() => setBuffering(false)}
          onDoubleClick={toggleFullscreen}
        >
          {stream.subtitles?.map((s) => (
            <track key={s.url} kind="subtitles" src={s.url} srcLang={s.lang} label={s.label} default={s.default} />
          ))}
        </video>

        {buffering && !error ? <div className="player__spinner spinner" aria-hidden /> : null}

        {skip ? (
          <button className="player__skip" onClick={() => doSkip(skip)}>
            Skip {skip} ⏭
          </button>
        ) : null}

        {nextIn !== null ? (
          <div className="player__next">
            <p>Next episode in {nextIn}…</p>
            <div>
              <button className="btn btn--primary" onClick={() => setNextIn(0)}>
                Play now
              </button>
              <button className="btn" onClick={() => setNextIn(null)}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {error ? <div className="player__error">{error}</div> : null}
      </div>

      <div className="player__bar">
        {qualities.length > 0 ? (
          <label>
            Quality
            <select value={quality} onChange={(e) => changeQuality(Number(e.target.value))}>
              {hlsRef.current ? <option value={-1}>Auto{activeLevel ? ` (${activeLevel})` : ""}</option> : null}
              {qualities.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.label}
                </option>
              ))}
            </select>
          </label>
        ) : activeLevel ? (
          <span className="muted">{activeLevel}</span>
        ) : null}
        <label>
          Speed
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </label>
        <button className="btn btn--sm" onClick={toggleFullscreen}>
          ⛶ Fullscreen
        </button>
        <span className="player__keys muted">Space play · ←/→ 5s · J/L 10s · F fullscreen · S skip · N next</span>
      </div>
    </div>
  );
}
