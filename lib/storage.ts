"use client";

// Watchlist and watch history, kept in the viewer's browser.

export type SavedAnime = {
  id: number;
  title: string;
  cover: string | null;
  format?: string | null;
  episodes?: number | null;
};

export type HistoryEntry = SavedAnime & {
  episode: number;
  time: number;
  duration: number;
  updatedAt: number;
};

const LIST_KEY = "as:watchlist";
const HISTORY_KEY = "as:history";
const PREFS_KEY = "as:prefs";
export const STORAGE_EVENT = "as:storage";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new Event(STORAGE_EVENT));
  } catch {
    /* storage unavailable (private mode etc.) */
  }
}

export function getWatchlist(): SavedAnime[] {
  return read<SavedAnime[]>(LIST_KEY, []);
}

export function inWatchlist(id: number) {
  return getWatchlist().some((a) => a.id === id);
}

export function toggleWatchlist(anime: SavedAnime): boolean {
  const list = getWatchlist();
  const exists = list.some((a) => a.id === anime.id);
  write(LIST_KEY, exists ? list.filter((a) => a.id !== anime.id) : [anime, ...list]);
  return !exists;
}

/** One entry per anime: the episode most recently watched. */
export function getHistory(): HistoryEntry[] {
  return read<HistoryEntry[]>(HISTORY_KEY, []).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveProgress(entry: Omit<HistoryEntry, "updatedAt">) {
  const rest = getHistory().filter((h) => h.id !== entry.id);
  write(HISTORY_KEY, [{ ...entry, updatedAt: Date.now() }, ...rest].slice(0, 100));
  write(`as:pos:${entry.id}:${entry.episode}`, { t: entry.time, d: entry.duration });
}

export function getPosition(id: number, episode: number): { t: number; d: number } | null {
  return read<{ t: number; d: number } | null>(`as:pos:${id}:${episode}`, null);
}

export function removeHistory(id: number) {
  write(HISTORY_KEY, getHistory().filter((h) => h.id !== id));
}

export type Prefs = { autoplay: boolean; autoSkip: boolean; source?: string };

export function getPrefs(): Prefs {
  return { autoplay: true, autoSkip: false, ...read<Partial<Prefs>>(PREFS_KEY, {}) };
}

export function setPrefs(p: Partial<Prefs>) {
  write(PREFS_KEY, { ...getPrefs(), ...p });
}
