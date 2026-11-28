"use client";

// Frame previews over a player's seek bar. None of our sources ship thumbnail sprites, so a
// hidden second video loads the same stream at its lowest quality and jumps to whatever time
// the pointer is over; that frame is drawn in a small box above the bar. One jump at a time,
// always toward the latest position; frames are cached in 2-second steps, a frame every 30
// seconds is fetched in the background, and the nearest cached frame shows while the exact
// one loads. Off on low-end phones (it costs data and memory).

import Hls from "hls.js";
import { useEffect, type RefObject } from "react";
import { keepAudioLanguage } from "@/lib/audio-track";
import { perfTier } from "@/lib/device";
import type { StreamSource } from "@/lib/sources/types";

const WIDTH = 176;
const STEP = 2; // seconds per cached frame
const PREFILL_EVERY = 30; // seconds between frames fetched in the background
const MAX_CACHED = 240;

/**
 * @param host  element the player is built inside
 * @param source  the stream being played (null while there's none)
 * @param barSelector  the seek bar inside `host` (the player builds it after mounting)
 */
export function useSeekPreview(
  host: RefObject<HTMLElement | null>,
  source: StreamSource | null | undefined,
  barSelector: string,
  /** The stream's audio language (Stream.audioLang), so it doesn't fetch some other one. */
  audioLang?: string,
) {
  const url = source?.url ?? "";
  const type = source?.type ?? "hls";

  useEffect(() => {
    if (!url || perfTier() === "low") return;
    let cancelled = false;

    // The hidden video. It has to be in the document for Media Source playback.
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.crossOrigin = "anonymous";
    video.setAttribute("aria-hidden", "true");
    Object.assign(video.style, { position: "fixed", left: "-9999px", top: "0", width: "2px", height: "2px", opacity: "0", pointerEvents: "none" });
    document.body.appendChild(video);

    let hls: Hls | null = null;
    if (type === "hls" && Hls.isSupported()) {
      hls = new Hls({ startLevel: 0, capLevelToPlayerSize: false, maxBufferLength: 2, maxMaxBufferLength: 4, backBufferLength: 0, enableWorker: true });
      // Lowest quality only: a preview doesn't need more.
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (hls) hls.currentLevel = 0;
      });
      keepAudioLanguage(hls, audioLang);
      hls.loadSource(url);
      hls.attachMedia(video);
    } else {
      video.src = url;
    }

    // The preview box: a canvas, positioned over the bar.
    const box = document.createElement("div");
    box.className = "seek-preview";
    const canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = Math.round((WIDTH * 9) / 16);
    box.appendChild(canvas);
    const ctx = canvas.getContext("2d");

    const cache = new Map<number, ImageBitmap>();
    let shownStep = -1;
    let wanted = -1;
    let busy = false;
    // Background fill: a frame every PREFILL_EVERY seconds across the episode, so most
    // hovers have something (the nearest frame) straight away.
    let prefill: number[] = [];

    const draw = (bmp: CanvasImageSource) => ctx?.drawImage(bmp, 0, 0, canvas.width, canvas.height);

    /** The cached frame for `step`, or the nearest one while that loads. */
    const nearest = (step: number): ImageBitmap | null => {
      let best: ImageBitmap | null = null;
      let dist = Infinity;
      for (const [s, bmp] of cache) {
        const d = Math.abs(s - step);
        if (d < dist) [best, dist] = [bmp, d];
      }
      return best;
    };

    const show = (step: number) => {
      shownStep = step;
      const hit = cache.get(step) ?? nearest(step);
      if (hit) draw(hit);
      box.classList.toggle("has-frame", !!hit);
      if (cache.has(step)) return;
      wanted = step;
      if (!busy) jump();
    };

    const jump = () => {
      if (cancelled || !video.duration) return;
      // What the pointer is over comes first, then the background fill.
      let step = wanted;
      wanted = -1;
      if (step < 0) {
        while (prefill.length && cache.has(prefill[0])) prefill.shift();
        step = prefill.shift() ?? -1;
      }
      if (step < 0) return;
      busy = true;
      let settled = false;
      const done = async () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        video.removeEventListener("seeked", done);
        if (cancelled) return;
        try {
          const bmp = await createImageBitmap(video, { resizeWidth: canvas.width, resizeHeight: canvas.height });
          if (cache.size >= MAX_CACHED) {
            const oldest = cache.keys().next().value as number;
            cache.get(oldest)?.close();
            cache.delete(oldest);
          }
          cache.set(step, bmp);
          if (step === shownStep) {
            draw(bmp);
            box.classList.add("has-frame");
          }
        } catch {
          /* frame not ready (or blocked): skip it */
        }
        busy = false;
        jump();
      };
      // A segment that never arrives mustn't stall every later preview.
      const timer = setTimeout(() => {
        settled = true;
        video.removeEventListener("seeked", done);
        busy = false;
        jump();
      }, 8000);
      video.addEventListener("seeked", done);
      video.currentTime = Math.min(step * STEP + 0.5, video.duration - 0.5);
    };

    video.addEventListener(
      "loadedmetadata",
      () => {
        const last = Math.floor(video.duration / STEP);
        const every = PREFILL_EVERY / STEP;
        prefill = Array.from({ length: Math.floor(last / every) + 1 }, (_, i) => i * every);
        if (!busy) jump();
      },
      { once: true },
    );

    // The player builds its seek bar after mounting, so look for it for a while.
    let bar: HTMLElement | null = null;
    // The box lives in the player area, not in the bar: player control strips clip what
    // sticks out of them.
    const onMove = (e: PointerEvent) => {
      const root = host.current;
      if (!bar || !root || !video.duration) return;
      const r = bar.getBoundingClientRect();
      const h = root.getBoundingClientRect();
      const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      const half = WIDTH / 2 + 2;
      const x = r.left - h.left + f * r.width;
      box.style.left = `${Math.min(h.width - half, Math.max(half, x))}px`;
      box.style.top = `${r.top - h.top - box.offsetHeight - 34}px`;
      box.classList.add("is-on");
      const step = Math.floor((f * video.duration) / STEP);
      if (step !== shownStep) show(step);
    };
    const onLeave = () => box.classList.remove("is-on");

    const find = setInterval(() => {
      const root = host.current;
      bar = root?.querySelector<HTMLElement>(barSelector) ?? null;
      if (!root || !bar) return;
      clearInterval(find);
      if (getComputedStyle(root).position === "static") root.style.position = "relative";
      root.appendChild(box);
      bar.addEventListener("pointermove", onMove);
      bar.addEventListener("pointerdown", onMove);
      bar.addEventListener("pointerleave", onLeave);
      bar.addEventListener("pointerup", (e) => e.pointerType !== "mouse" && onLeave());
    }, 300);
    const giveUp = setTimeout(() => clearInterval(find), 15000);

    return () => {
      cancelled = true;
      clearInterval(find);
      clearTimeout(giveUp);
      bar?.removeEventListener("pointermove", onMove);
      bar?.removeEventListener("pointerdown", onMove);
      bar?.removeEventListener("pointerleave", onLeave);
      box.remove();
      for (const bmp of cache.values()) bmp.close();
      hls?.destroy();
      video.removeAttribute("src");
      video.load();
      video.remove();
    };
  }, [host, url, type, barSelector, audioLang]);
}
