// Where manga chapters come from, shared by the server and the browser.

import type { Chapter } from "./mangadex";

/** In default priority order: the first source with a chapter number supplies it. */
export const MANGA_SOURCES = [
  { id: "mangadex", name: "MangaDex" },
  { id: "asura", name: "Asura Scans" },
  { id: "mangakatana", name: "MangaKatana" },
  { id: "mangapill", name: "MangaPill" },
] as const;

export type MangaSourceId = (typeof MANGA_SOURCES)[number]["id"];

/** Each source's chapters for one manga, oldest first. Sources without any are left out. */
export type SourceChapters = Partial<Record<MangaSourceId, Chapter[]>>;

const PREFIXES: Record<string, MangaSourceId> = { mk: "mangakatana", mp: "mangapill", as: "asura" };

/** The source a chapter id belongs to (MangaDex ids are plain UUIDs). */
export function sourceOf(chapterId: string): MangaSourceId {
  return PREFIXES[chapterId.slice(0, 3).replace("-", "")] ?? "mangadex";
}

export function sourceName(id: string): string {
  return MANGA_SOURCES.find((s) => s.id === id)?.name ?? id;
}

/** One list from all sources, oldest first: `preferred` first, then the default order, each filling in numbers the ones before it lack. */
export function mergeChapters(sources: SourceChapters, preferred = ""): Chapter[] {
  const order = [...MANGA_SOURCES.map((s) => s.id)].sort((a, b) => Number(b === preferred) - Number(a === preferred));
  const have = new Set<number>();
  const out: Chapter[] = [];
  for (const id of order) {
    for (const c of sources[id] ?? []) {
      const n = parseFloat(c.number);
      if (have.has(n)) continue;
      have.add(n);
      out.push(c);
    }
  }
  return out.sort((x, y) => parseFloat(x.number) - parseFloat(y.number));
}
