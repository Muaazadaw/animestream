"use client";

// Browser side of manga: the chapter list for a manga (shared by the detail
// page and the reader, fetched once per visit) and the reader's settings.

import { useEffect, useState } from "react";
import type { Chapter } from "./mangadex";

export type { Chapter };

const cache = new Map<number, Promise<Chapter[]>>();

export function fetchChapters(anilistId: number): Promise<Chapter[]> {
  let p = cache.get(anilistId);
  if (!p) {
    p = fetch(`/api/manga/chapters?id=${anilistId}`)
      .then((r) => (r.ok ? r.json() : { chapters: [] }))
      .then((d: { chapters?: Chapter[] }) => d.chapters ?? []);
    p.catch(() => cache.delete(anilistId));
    cache.set(anilistId, p);
  }
  return p;
}

/** Chapters Mayoi can show for a manga, oldest first. `null` while loading. */
export function useChapters(anilistId: number) {
  const [chapters, setChapters] = useState<Chapter[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    fetchChapters(anilistId)
      .then((c) => live && setChapters(c))
      .catch(() => live && (setError(true), setChapters([])));
    return () => {
      live = false;
    };
  }, [anilistId]);
  return { chapters, error };
}

export type ReaderPrefs = {
  /** One page, two pages side by side, or a long strip (webtoon). */
  mode: "single" | "double" | "vertical";
  /** Space between pages, in pixels. */
  margin: number;
  /** ↑ ↓ and Space: jump or glide. */
  keyScroll: "fast" | "smooth";
  /** How far ↑ ↓ and Space move, as % of the screen height. */
  scrollAmount: number;
  /** Where the page progress bar sits. */
  progressBar: "left" | "top" | "right" | "bottom" | "none";
  fitWidth: boolean;
  fitHeight: boolean;
  /** Let small images grow to fill the width / height. */
  stretch: boolean;
  /** With fit width: no wider than 1000px. */
  limitWidth: boolean;
  /** With fit height: leave room for the controls. */
  limitHeight: boolean;
  grayscale: boolean;
  /** Darken the pages, 0–80 (%). */
  dim: number;
  /** Smaller, compressed images where the source has them. */
  saver: boolean;
};

const PREFS_KEY = "as:reader";
export const DEFAULT_READER_PREFS: ReaderPrefs = {
  mode: "vertical",
  margin: 0,
  keyScroll: "smooth",
  scrollAmount: 50,
  progressBar: "left",
  fitWidth: false,
  fitHeight: false,
  stretch: false,
  limitWidth: false,
  limitHeight: false,
  grayscale: false,
  dim: 0,
  saver: false,
};

export function getReaderPrefs(): ReaderPrefs {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
    // Older settings: "paged" mode, "fit: width" and a gap toggle.
    if (saved.mode === "paged") saved.mode = "single";
    if (saved.fit === "width") saved.fitWidth = true;
    if (saved.gap === true && saved.margin === undefined) saved.margin = 10;
    return { ...DEFAULT_READER_PREFS, ...saved };
  } catch {
    return DEFAULT_READER_PREFS;
  }
}

export function saveReaderPrefs(p: ReaderPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable */
  }
}
