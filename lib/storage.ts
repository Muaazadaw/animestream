"use client";

// Watchlist, watch history and lists, kept in the viewer's browser. When the
// viewer is signed in, lib/sync.ts mirrors all of it to their account.

import {
  emptyState,
  mergeState,
  type CustomList,
  type Favorite,
  type HistoryEntry,
  type LibraryState,
  type ListEntry,
  type ListStatus,
  type Position,
  type Profile,
  type SavedAnime,
  type WatchlistEntry,
} from "./state";

export type { CustomList, Favorite, HistoryEntry, ListEntry, ListStatus, Profile, SavedAnime } from "./state";

const LIST_KEY = "as:watchlist";
const HISTORY_KEY = "as:history";
const PREFS_KEY = "as:prefs";
const LISTS_KEY = "as:lists";
const FAVORITES_KEY = "as:favorites";
const CUSTOM_KEY = "as:custom-lists";
const PROFILE_KEY = "as:profile";
const SEEN_KEY = "as:seen";
const REMOVED_KEY = "as:removed";
const POS_PREFIX = "as:pos:";
/** Fired on every change, for the UI. */
export const STORAGE_EVENT = "as:storage";
/** Fired only for changes made on this device, for sync. */
export const LOCAL_CHANGE_EVENT = "as:local-change";
/** Fired (detail: ListEntry | { id, removed: true }) when the viewer changes a list entry here. */
export const LIST_CHANGE_EVENT = "as:list-change";

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
  const full = { ...entry, updatedAt: Date.now() };
  write(LISTS_KEY, { ...getLists(), [entry.id]: full });
  window.dispatchEvent(new CustomEvent(LIST_CHANGE_EVENT, { detail: full }));
}

export function setListStatus(anime: SavedAnime, status: ListStatus | null) {
  const lists = getLists();
  if (!status) {
    delete lists[anime.id];
    write(LISTS_KEY, lists);
    window.dispatchEvent(new CustomEvent(LIST_CHANGE_EVENT, { detail: { id: anime.id, removed: true } }));
    return;
  }
  const cur = lists[anime.id];
  setListEntry({ ...anime, status, progress: cur?.progress ?? 0, score: cur?.score ?? 0, from: cur?.from ?? "site" });
}

export function getFavorites(): Record<string, Favorite> {
  return read<Record<string, Favorite>>(FAVORITES_KEY, {});
}

export function isFavorite(id: number) {
  return !!getFavorites()[id]?.on;
}

export function toggleFavorite(anime: SavedAnime): boolean {
  const on = !isFavorite(anime.id);
  write(FAVORITES_KEY, { ...getFavorites(), [anime.id]: { ...anime, on, updatedAt: Date.now() } });
  return on;
}

export function getCustomLists(): CustomList[] {
  return Object.values(read<Record<string, CustomList>>(CUSTOM_KEY, {}))
    .filter((l) => !l.deleted)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function saveCustomList(list: CustomList) {
  write(CUSTOM_KEY, { ...read<Record<string, CustomList>>(CUSTOM_KEY, {}), [list.id]: { ...list, updatedAt: Date.now() } });
}

export function createCustomList(name: string): CustomList {
  const list: CustomList = { id: Math.random().toString(36).slice(2, 10), name: name.trim(), items: [], updatedAt: Date.now() };
  saveCustomList(list);
  return list;
}

export function deleteCustomList(id: string) {
  const list = read<Record<string, CustomList>>(CUSTOM_KEY, {})[id];
  if (list) saveCustomList({ ...list, items: [], deleted: true });
}

export function toggleInCustomList(id: string, anime: SavedAnime) {
  const list = read<Record<string, CustomList>>(CUSTOM_KEY, {})[id];
  if (!list) return;
  const has = list.items.some((a) => a.id === anime.id);
  saveCustomList({ ...list, items: has ? list.items.filter((a) => a.id !== anime.id) : [anime, ...list.items] });
}

export function getProfile(): Profile {
  return read<Profile>(PROFILE_KEY, { updatedAt: 0 });
}

export function setProfile(p: Partial<Profile>) {
  write(PROFILE_KEY, { ...getProfile(), ...p, updatedAt: Date.now() });
}

export function getSeen(): Record<string, number> {
  return read<Record<string, number>>(SEEN_KEY, {});
}

export function isSeen(seen: Record<string, number>, id: string) {
  return (seen[id] ?? 0) > 0;
}

/** Mark notifications read (or unread again). */
export function markSeen(ids: string[], read = true) {
  const seen = getSeen();
  const now = Date.now();
  let changed = false;
  for (const id of ids) {
    if (isSeen(seen, id) !== read) {
      seen[id] = read ? now : -now;
      changed = true;
    }
  }
  if (changed) write(SEEN_KEY, seen);
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
    favorites: getFavorites(),
    customLists: read<Record<string, CustomList>>(CUSTOM_KEY, {}),
    profile: getProfile(),
    seen: getSeen(),
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
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(s.favorites));
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(s.customLists));
    localStorage.setItem(PROFILE_KEY, JSON.stringify(s.profile));
    localStorage.setItem(SEEN_KEY, JSON.stringify(s.seen));
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
