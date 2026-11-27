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
  /** Long strip (webtoon) or one page at a time. */
  mode: "vertical" | "paged";
  /** Smaller, compressed images. */
  saver: boolean;
  /** Width of the strip in vertical mode. */
  fit: "width" | "comfy";
  /** Gap between pages in vertical mode. */
  gap: boolean;
};

const PREFS_KEY = "as:reader";
const DEFAULT_PREFS: ReaderPrefs = { mode: "vertical", saver: false, fit: "comfy", gap: false };

export function getReaderPrefs(): ReaderPrefs {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function saveReaderPrefs(p: ReaderPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable */
  }
}
