"use client";

import Hls from "hls.js";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Stream } from "@/lib/sources/types";

type Quality = { id: number; label: string };

type SubtitleSettings = {
  enabled: boolean;
  fontSize: number;
  textColor: string;
  backgroundColor: string;
  backgroundOpacity: number;
  outlineColor: string;
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

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

const DEFAULT_SUBTITLE_SETTINGS: SubtitleSettings = {
  enabled: true,
  fontSize: 18,
  textColor: "#ffffff",
  backgroundColor: "#000000",
  backgroundOpacity: 0.6,
  outlineColor: "#000000",
  outlineWidth: 2,
  bottomOffset: 8,
  delay: 0,
};

const SUBTITLE_STORAGE_KEY = "animestream:subtitle-settings";

function loadSubtitleSettings(): SubtitleSettings {
  if (typeof window === "undefined") return DEFAULT_SUBTITLE_SETTINGS;

  try {
    const saved = window.localStorage.getItem(SUBTITLE_STORAGE_KEY);
    if (!saved) return DEFAULT_SUBTITLE_SETTINGS;

    return {
      ...DEFAULT_SUBTITLE_SETTINGS,
      ...JSON.parse(saved),
    };
  } catch {
    return DEFAULT_SUBTITLE_SETTINGS;
  }
}

export default function Player({
  stream,
  poster,
  startAt,
  autoSkip,
  autoplayNext,
  hasNext,
  onNext,
  onProgress,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const lastSaved = useRef(0);
  const skipped = useRef({ intro: false, outro: false });

  const [qualities, setQualities] = useState<Quality[]>([]);
  const [quality, setQuality] = useState(-1);
  const [activeLevel, setActiveLevel] = useState<string>("");
  const [speed, setSpeed] = useState(1);
  const [skip, setSkip] = useState<"intro" | "outro" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [buffering, setBuffering] = useState(true);
  const [nextIn, setNextIn] = useState<number | null>(null);

  const [subtitleSettings, setSubtitleSettings] = useState<SubtitleSettings>(
    DEFAULT_SUBTITLE_SETTINGS,
  );
  const [showSubtitleSettings, setShowSubtitleSettings] = useState(false);

  const cb = useRef({ onProgress, onNext, autoSkip, autoplayNext, hasNext });
  cb.current = { onProgress, onNext, autoSkip, autoplayNext, hasNext };

  useEffect(() => {
    setSubtitleSettings(loadSubtitleSettings());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      window.localStorage.setItem(
        SUBTITLE_STORAGE_KEY,
        JSON.stringify(subtitleSettings),
      );
    } catch {
      // Ignore private browsing or storage errors.
    }
  }, [subtitleSettings]);

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
        if (
          resumeAt &&
          resumeAt > 5 &&
          (!video.duration || resumeAt < video.duration - 10)
        ) {
          video.currentTime = resumeAt;
        }

        video.playbackRate = speed;
        video.play().catch(() => {});
      };

      if (src.type === "hls" && Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          capLevelToPlayerSize: true,
        });

        hlsRef.current = hls;
        let mediaRecoveries = 0;

        hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
          const ladder = data.levels
            .map((level, id) => ({
              id,
              label: level.height
                ? `${level.height}p`
                : `${Math.round(level.bitrate / 1000)} kbps`,
            }))
            .sort(
              (a, b) => parseInt(b.label) - parseInt(a.label),
            );

          setQualities(ladder);
          setQuality(-1);
          video.addEventListener("loadedmetadata", seekAndPlay, {
            once: true,
          });
        });

        hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
          const level = hls.levels[data.level];
          setActiveLevel(level?.height ? `${level.height}p` : "");
        });

        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;

          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
          } else if (
            data.type === Hls.ErrorTypes.MEDIA_ERROR &&
            mediaRecoveries++ < 2
          ) {
            hls.recoverMediaError();
          } else {
            setError("This stream failed to load. Try another server.");
            hls.destroy();
          }
        });

        hls.loadSource(src.url);
        hls.attachMedia(video);
      } else {
        if (
          src.type === "hls" &&
          !video.canPlayType("application/vnd.apple.mpegurl")
        ) {
          setError("Your browser can't play this stream.");
          return;
        }

        if (src.type === "mp4") {
          setQualities(
            stream.sources.length > 1
              ? stream.sources.map((source, id) => ({
                  id,
                  label: source.quality ?? `Source ${id + 1}`,
                }))
              : [],
          );
        } else {
          setQualities([]);
        }

        setActiveLevel(src.quality ?? "");
        video.src = src.url;
        video.addEventListener("loadedmetadata", seekAndPlay, {
          once: true,
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stream],
  );

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
  }, [speed]);

  function changeQuality(id: number) {
    setQuality(id);

    const hls = hlsRef.current;

    if (hls) {
      hls.currentLevel = id;
    } else if (stream.sources[id]) {
      const time = videoRef.current?.currentTime ?? 0;
      load(id, time);
    }
  }

  function onTimeUpdate() {
    const video = videoRef.current;
    if (!video || !video.duration) return;

    const time = video.currentTime;

    const inRange = (range?: { start: number; end: number }) =>
      !!range && time >= range.start && time < range.end - 1;

    let which: "intro" | "outro" | null = null;

    if (inRange(stream.intro)) which = "intro";
    else if (inRange(stream.outro)) which = "outro";

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
  }

  function doSkip(which: "intro" | "outro") {
    const video = videoRef.current;
    const range = which === "intro" ? stream.intro : stream.outro;

    if (!video || !range) return;

    video.currentTime = Math.min(range.end, video.duration - 0.5);
    setSkip(null);
  }

  function onEnded() {
    const video = videoRef.current;

    if (video) {
      cb.current.onProgress(video.duration, video.duration);
    }

    if (cb.current.autoplayNext && cb.current.hasNext) {
      setNextIn(5);
    }
  }

  useEffect(() => {
    if (nextIn === null) return;

    if (nextIn <= 0) {
      setNextIn(null);
      cb.current.onNext();
      return;
    }

    const timer = setTimeout(() => {
      setNextIn((current) => (current === null ? null : current - 1));
    }, 1000);

    return () => clearTimeout(timer);
  }, [nextIn]);

  const toggleFullscreen = useCallback(() => {
    const element = wrapRef.current;
    if (!element) return;

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      element.requestFullscreen?.().catch(() => {});
    }
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;

      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      ) {
        return;
      }

      const video = videoRef.current;
      if (!video) return;

      switch (event.key.toLowerCase()) {
        case " ":
        case "k":
          event.preventDefault();

          if (video.paused) {
            video.play().catch(() => {});
          } else {
            video.pause();
          }

          break;

        case "arrowleft":
          event.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - 5);
          break;

        case "arrowright":
          event.preventDefault();
          video.currentTime = Math.min(
            video.duration || Number.POSITIVE_INFINITY,
            video.currentTime + 5,
          );
          break;

        case "j":
          video.currentTime = Math.max(0, video.currentTime - 10);
          break;

        case "l":
          video.currentTime = Math.min(
            video.duration || Number.POSITIVE_INFINITY,
            video.currentTime + 10,
          );
          break;

        case "m":
          video.muted = !video.muted;
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

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip, toggleFullscreen]);

  const needsCors = (stream.subtitles?.length ?? 0) > 0;

  const subtitleStyle = {
    "--subtitle-font-size": `${subtitleSettings.fontSize}px`,
    "--subtitle-text-color": subtitleSettings.textColor,
    "--subtitle-bg-color": subtitleSettings.backgroundColor,
    "--subtitle-bg-opacity": subtitleSettings.backgroundOpacity,
    "--subtitle-outline-color": subtitleSettings.outlineColor,
    "--subtitle-outline-width": `${subtitleSettings.outlineWidth}px`,
    "--subtitle-bottom-offset": `${subtitleSettings.bottomOffset}%`,
  } as React.CSSProperties;

  return (
    <div className="player-wrap" style={subtitleStyle}>
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
            if (
              !hlsRef.current &&
              videoRef.current?.getAttribute("src")
            ) {
              setError(
                "This video failed to load. Try another quality or server.",
              );
            }
          }}
          onWaiting={() => setBuffering(true)}
          onPlaying={() => setBuffering(false)}
          onCanPlay={() => setBuffering(false)}
          onDoubleClick={toggleFullscreen}
        >
          {stream.subtitles?.map((subtitle) => (
            <track
              key={subtitle.url}
              kind="subtitles"
              src={subtitle.url}
              srcLang={subtitle.lang}
              label={subtitle.label}
              default={subtitle.default}
            />
          ))}
        </video>

        {buffering && !error ? (
          <div className="player__spinner spinner" aria-hidden />
        ) : null}

        {skip ? (
          <button className="player__skip" onClick={() => doSkip(skip)}>
            Skip {skip}
          </button>
        ) : null}

        {nextIn !== null ? (
          <div className="player__next">
            <p>Next episode in {nextIn}...</p>
            <div>
              <button
                className="btn btn--primary"
                onClick={() => setNextIn(0)}
              >
                Play now
              </button>
              <button
                className="btn"
                onClick={() => setNextIn(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {error ? <div className="player__error">{error}</div> : null}

        {showSubtitleSettings ? (
          <div className="subtitle-settings">
            <div className="subtitle-settings__header">
              <strong>Subtitle settings</strong>
              <button
                className="btn btn--sm"
                onClick={() => setShowSubtitleSettings(false)}
              >
                Close
              </button>
            </div>

            <label className="subtitle-settings__row">
              <input
                type="checkbox"
                checked={subtitleSettings.enabled}
                onChange={(event) =>
                  setSubtitleSettings((current) => ({
                    ...current,
                    enabled: event.target.checked,
                  }))
                }
              />
              Show subtitles
            </label>

            <label className="subtitle-settings__row">
              Font size
              <input
                type="range"
                min={12}
                max={40}
                value={subtitleSettings.fontSize}
                onChange={(event) =>
                  setSubtitleSettings((current) => ({
                    ...current,
                    fontSize: Number(event.target.value),
                  }))
                }
              />
              <span>{subtitleSettings.fontSize}px</span>
            </label>

            <label className="subtitle-settings__row">
              Text color
              <input
                type="color"
                value={subtitleSettings.textColor}
                onChange={(event) =>
                  setSubtitleSettings((current) => ({
                    ...current,
                    textColor: event.target.value,
                  }))
                }
              />
            </label>

            <label className="subtitle-settings__row">
              Background color
              <input
                type="color"
                value={subtitleSettings.backgroundColor}
                onChange={(event) =>
                  setSubtitleSettings((current) => ({
                    ...current,
                    backgroundColor: event.target.value,
                  }))
                }
              />
            </label>

            <label className="subtitle-settings__row">
              Background opacity
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={subtitleSettings.backgroundOpacity}
                onChange={(event) =>
                  setSubtitleSettings((current) => ({
                    ...current,
                    backgroundOpacity: Number(event.target.value),
                  }))
                }
              />
              <span>
                {Math.round(subtitleSettings.backgroundOpacity * 100)}%
              </span>
            </label>

            <label className="subtitle-settings__row">
              Outline color
              <input
                type="color"
                value={subtitleSettings.outlineColor}
                onChange={(event) =>
                  setSubtitleSettings((current) => ({
                    ...current,
                    outlineColor: event.target.value,
                  }))
                }
              />
            </label>

            <label className="subtitle-settings__row">
              Outline width
              <input
                type="range"
                min={0}
                max={6}
                value={subtitleSettings.outlineWidth}
                onChange={(event) =>
                  setSubtitleSettings((current) => ({
                    ...current,
                    outlineWidth: Number(event.target.value),
                  }))
                }
              />
              <span>{subtitleSettings.outlineWidth}px</span>
            </label>

            <label className="subtitle-settings__row">
              Position from bottom
              <input
                type="range"
                min={0}
                max={40}
                value={subtitleSettings.bottomOffset}
                onChange={(event) =>
                  setSubtitleSettings((current) => ({
                    ...current,
                    bottomOffset: Number(event.target.value),
                  }))
                }
              />
              <span>{subtitleSettings.bottomOffset}%</span>
            </label>

            <label className="subtitle-settings__row">
              Subtitle delay
              <input
                type="range"
                min={-10}
                max={10}
                step={0.1}
                value={subtitleSettings.delay}
                onChange={(event) =>
                  setSubtitleSettings((current) => ({
                    ...current,
                    delay: Number(event.target.value),
                  }))
                }
              />
              <span>{subtitleSettings.delay}s</span>
            </label>

            <button
              className="btn btn--sm"
              onClick={() =>
                setSubtitleSettings(DEFAULT_SUBTITLE_SETTINGS)
              }
            >
              Reset to default
            </button>
          </div>
        ) : null}
      </div>

      <div className="player__bar">
        {qualities.length > 0 ? (
          <label>
            Quality
            <select
              value={quality}
              onChange={(event) =>
                changeQuality(Number(event.target.value))
              }
            >
              {hlsRef.current ? (
                <option value={-1}>
                  Auto
                  {activeLevel ? ` (${activeLevel})` : ""}
                </option>
              ) : null}

              {qualities.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        ) : activeLevel ? (
          <span className="muted">{activeLevel}</span>
        ) : null}

        <label>
          Speed
          <select
            value={speed}
            onChange={(event) => setSpeed(Number(event.target.value))}
          >
            {SPEEDS.map((value) => (
              <option key={value} value={value}>
                {value}x
              </option>
            ))}
          </select>
        </label>

        <button
          className="btn btn--sm"
          onClick={() => setShowSubtitleSettings((current) => !current)}
        >
          Subtitles
        </button>

        <button className="btn btn--sm" onClick={toggleFullscreen}>
          Fullscreen
        </button>

        <span className="player__keys muted">
          Space play · Left/Right 5s · J/L 10s · F fullscreen · S skip · N
          next
        </span>
      </div>
    </div>
  );
}