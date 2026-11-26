"use client";

// Watchlist, watch history and lists, kept in the viewer's browser. When the
// viewer is signed in, lib/sync.ts mirrors all of it to their account.

import {
  emptyState,
  mergeState,
  type HistoryEntry,
  type LibraryState,
  type ListEntry,
  type ListStatus,
  type Position,
  type SavedAnime,
  type WatchlistEntry,
} from "./state";

export type { HistoryEntry, ListEntry, ListStatus, SavedAnime } from "./state";

const LIST_KEY = "as:watchlist";
const HISTORY_KEY = "as:history";
const PREFS_KEY = "as:prefs";
const LISTS_KEY = "as:lists";
const REMOVED_KEY = "as:removed";
const POS_PREFIX = "as:pos:";
/** Fired on every change, for the UI. */
export const STORAGE_EVENT = "as:storage";
/** Fired only for changes made on this device, for sync. */
export const LOCAL_CHANGE_EVENT = "as:local-change";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown, local = true) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new Event(STORAGE_EVENT));
    if (local) window.dispatchEvent(new Event(LOCAL_CHANGE_EVENT));
  } catch {
    /* storage unavailable (private mode etc.) */
  }
}

function getRemoved(): LibraryState["removed"] {
  return read(REMOVED_KEY, emptyState().removed);
}

function markRemoved(kind: "history" | "watchlist", id: number) {
  const r = getRemoved();
  r[kind][id] = Date.now();
  write(REMOVED_KEY, r);
}

export function getWatchlist(): WatchlistEntry[] {
  return read<WatchlistEntry[]>(LIST_KEY, []);
}

export function inWatchlist(id: number) {
  return getWatchlist().some((a) => a.id === id);
}

export function toggleWatchlist(anime: SavedAnime): boolean {
  const list = getWatchlist();
  const exists = list.some((a) => a.id === anime.id);
  if (exists) markRemoved("watchlist", anime.id);
  write(LIST_KEY, exists ? list.filter((a) => a.id !== anime.id) : [{ ...anime, addedAt: Date.now() }, ...list]);
  return !exists;
}

/** One entry per anime: the episode most recently watched. */
export function getHistory(): HistoryEntry[] {
  return read<HistoryEntry[]>(HISTORY_KEY, []).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveProgress(entry: Omit<HistoryEntry, "updatedAt">) {
  const now = Date.now();
  const rest = getHistory().filter((h) => h.id !== entry.id);
  write(HISTORY_KEY, [{ ...entry, updatedAt: now }, ...rest].slice(0, 200));
  write(`${POS_PREFIX}${entry.id}:${entry.episode}`, { t: entry.time, d: entry.duration, u: now });

  // Finishing an episode moves the show along in the viewer's list.
  if (entry.duration && entry.time / entry.duration > 0.9) {
    const cur = getLists()[entry.id];
    if (!cur || cur.progress < entry.episode) {
      const done = !!entry.episodes && entry.episode >= entry.episodes;
      setListEntry({
        id: entry.id,
        title: entry.title,
        cover: entry.cover,
        format: entry.format,
        episodes: entry.episodes,
        status: done ? "COMPLETED" : cur?.status === "REPEATING" ? "REPEATING" : "CURRENT",
        progress: entry.episode,
        score: cur?.score ?? 0,
        from: cur?.from ?? "site",
      });
    }
  }
}

export function getPosition(id: number, episode: number): Position | null {
  return read<Position | null>(`${POS_PREFIX}${id}:${episode}`, null);
}

export function removeHistory(id: number) {
  markRemoved("history", id);
  write(HISTORY_KEY, getHistory().filter((h) => h.id !== id));
}

export function getLists(): Record<string, ListEntry> {
  return read<Record<string, ListEntry>>(LISTS_KEY, {});
}

export function setListEntry(entry: Omit<ListEntry, "updatedAt">) {
  write(LISTS_KEY, { ...getLists(), [entry.id]: { ...entry, updatedAt: Date.now() } });
}

export function setListStatus(anime: SavedAnime, status: ListStatus | null) {
  const lists = getLists();
  if (!status) {
    delete lists[anime.id];
    write(LISTS_KEY, lists);
    return;
  }
  const cur = lists[anime.id];
  setListEntry({ ...anime, status, progress: cur?.progress ?? 0, score: cur?.score ?? 0, from: cur?.from ?? "site" });
}

/** Everything above, as one document for syncing. */
export function exportState(): LibraryState {
  const positions: Record<string, Position> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(POS_PREFIX)) {
        const p = read<Position | null>(k, null);
        if (p) positions[k.slice(POS_PREFIX.length)] = p;
      }
    }
  } catch {
    /* storage unavailable */
  }
  return {
    history: getHistory(),
    watchlist: getWatchlist(),
    positions,
    lists: getLists(),
    removed: getRemoved(),
  };
}

/**
 * Merge a document (from the server or an import) into this browser.
 * `local` marks it as a change made here, so it gets pushed to the account.
 */
export function importState(incoming: Partial<LibraryState>, local = false) {
  const before = exportState();
  const s = mergeState(before, incoming);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(s.history));
    localStorage.setItem(LIST_KEY, JSON.stringify(s.watchlist));
    localStorage.setItem(LISTS_KEY, JSON.stringify(s.lists));
    localStorage.setItem(REMOVED_KEY, JSON.stringify(s.removed));
    for (const [k, p] of Object.entries(s.positions)) {
      if (before.positions[k]?.u !== p.u || !before.positions[k]) localStorage.setItem(POS_PREFIX + k, JSON.stringify(p));
    }
  } catch {
    return;
  }
  window.dispatchEvent(new Event(STORAGE_EVENT));
  if (local) window.dispatchEvent(new Event(LOCAL_CHANGE_EVENT));
}

export type Audio = "sub" | "dub";
export type Prefs = { autoplay: boolean; autoSkip: boolean; source?: string; audio?: Audio; hideSpoilers?: boolean };

export function getPrefs(): Prefs {
  return { autoplay: true, autoSkip: false, hideSpoilers: true, ...read<Partial<Prefs>>(PREFS_KEY, {}) };
}

export function setPrefs(p: Partial<Prefs>) {
  write(PREFS_KEY, { ...getPrefs(), ...p }, false);
}
