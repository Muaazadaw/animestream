"use client";

// Browser side of manga: the chapter list for a manga (shared by the detail
// page and the reader, fetched once per visit) and the reader's settings.

import { useEffect, useMemo, useState } from "react";
import { usePrefs } from "../use-prefs";
import type { Chapter } from "./mangadex";
import { MANGA_SOURCES, mergeChapters, type MangaSourceId, type SourceChapters } from "./sources";

export type { Chapter };

const cache = new Map<number, Promise<SourceChapters>>();

export function fetchChapters(anilistId: number): Promise<SourceChapters> {
  let p = cache.get(anilistId);
  if (!p) {
    p = fetch(`/api/manga/chapters?id=${anilistId}`)
      .then((r) => (r.ok ? r.json() : { sources: {} }))
      .then((d: { sources?: SourceChapters }) => d.sources ?? {});
    p.catch(() => cache.delete(anilistId));
    cache.set(anilistId, p);
  }
  return p;
}

/**
 * Chapters Mayoi can show for a manga, oldest first (all sources merged, the preferred one
 * first), and each source's own list. `null` while loading.
 */
export function useChapters(anilistId: number) {
  const [sources, setSources] = useState<SourceChapters | null>(null);
  const [error, setError] = useState(false);
  const preferred = usePrefs()?.mangaSource ?? "";
  useEffect(() => {
    let live = true;
    fetchChapters(anilistId)
      .then((s) => live && setSources(s))
      .catch(() => live && (setError(true), setSources({})));
    return () => {
      live = false;
    };
  }, [anilistId]);
  const chapters = useMemo(() => (sources ? mergeChapters(sources, preferred) : null), [sources, preferred]);
  return { chapters, sources, error };
}

// How long each source took to show a chapter's first page, in ms (a running average).
const SPEED_KEY = "as:manga-speed";

function speeds(): Partial<Record<MangaSourceId, number>> {
  try {
    return JSON.parse(localStorage.getItem(SPEED_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function recordSourceSpeed(source: MangaSourceId, ms: number) {
  const all = speeds();
  all[source] = all[source] ? Math.round(all[source]! * 0.7 + ms * 0.3) : Math.round(ms);
  try {
    localStorage.setItem(SPEED_KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable */
  }
}

/** Other sources' uploads of a chapter number, fastest first (sources not timed yet go in the default order, after timed ones). */
export function alternatives(sources: SourceChapters, number: string, skip: Set<string>): Chapter[] {
  const known = speeds();
  const n = parseFloat(number);
  return MANGA_SOURCES.map((s) => ({ s: s.id, c: sources[s.id]?.find((c) => parseFloat(c.number) === n) }))
    .filter((x): x is { s: MangaSourceId; c: Chapter } => !!x.c && !skip.has(x.c.id))
    .sort((a, b) => (known[a.s] ?? 1e9) - (known[b.s] ?? 1e9))
    .map((x) => x.c);
}

export type ReaderPrefs = {
  /** One page, two pages side by side, or a long strip (webtoon). */
  mode: "single" | "double" | "vertical";
  /** The layout picked for each kind of comic; unset ones use the default (strip for manhwa / manhua, single for manga). */
  modes?: Partial<Record<"manga" | "webtoon", "single" | "double" | "vertical">>;
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
  /** Page size, 50–300 (%); over 100 the pages can be scrolled sideways. */
  zoom: number;
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
  zoom: 100,
  saver: false,
};

export function getReaderPrefs(): ReaderPrefs {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
    // Low-memory phones start with smaller page images (until changed in settings).
    if (saved.saver === undefined && document.documentElement.dataset.perf === "low") saved.saver = true;
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
