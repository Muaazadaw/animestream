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

/** Whether a position counts as having watched the episode (Settings → sync threshold). */
export function isWatched(time: number, duration: number) {
  return duration > 0 && time / duration >= getPrefs().syncThreshold;
}

export function saveProgress(entry: Omit<HistoryEntry, "updatedAt">) {
  const prefs = getPrefs();
  if (prefs.pauseHistory) return;
  const now = Date.now();
  const rest = getHistory().filter((h) => h.id !== entry.id);
  write(HISTORY_KEY, [{ ...entry, updatedAt: now }, ...rest].slice(0, 200));
  write(`${POS_PREFIX}${entry.id}:${entry.episode}`, { t: entry.time, d: entry.duration, u: now });

  // Finishing an episode moves the show along in the viewer's list.
  if (prefs.autoSyncList && isWatched(entry.time, entry.duration)) {
    const cur = getLists()[entry.id];
    // Only shows being watched (or not in a list yet) move along; Planning/Paused etc. are left alone.
    const tracking = !cur || cur.status === "CURRENT" || cur.status === "REPEATING";
    if (tracking && (!cur || cur.progress < entry.episode)) {
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
        ...keepDetails(cur, done ? "COMPLETED" : "CURRENT"),
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

/** Forget every watched show and playback position (synced as deletions). */
export function clearHistory() {
  const now = Date.now();
  const removed = getRemoved();
  for (const h of getHistory()) removed.history[h.id] = now;
  write(REMOVED_KEY, removed);
  write(HISTORY_KEY, []);
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(POS_PREFIX)) localStorage.removeItem(k);
  } catch {
    /* storage unavailable */
  }
}

export function getLists(): Record<string, ListEntry> {
  return read<Record<string, ListEntry>>(LISTS_KEY, {});
}

/**
 * The fields a quick change (status menu, finishing an episode) shouldn't lose:
 * dates, rewatches and notes. Fills the start / end date like AniList does.
 */
function keepDetails(cur: ListEntry | undefined, status: ListStatus) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    startedAt: cur?.startedAt ?? (status === "CURRENT" || status === "COMPLETED" ? today : undefined),
    completedAt: cur?.completedAt ?? (status === "COMPLETED" ? today : undefined),
    repeat: cur?.repeat,
    notes: cur?.notes,
  };
}

export function setListEntry(entry: Omit<ListEntry, "updatedAt">) {
  const full = { ...entry, updatedAt: Date.now() };
  write(LISTS_KEY, { ...getLists(), [entry.id]: full });
  window.dispatchEvent(new CustomEvent(LIST_CHANGE_EVENT, { detail: full }));
}

/**
 * Record that a manga chapter was read: moves list progress forward (never back)
 * and marks it Reading, or Completed at the last chapter. Pushed to AniList if linked.
 */
export function markChapterRead(manga: SavedAnime, chapter: number) {
  const prefs = getPrefs();
  if (prefs.pauseHistory || !prefs.autoSyncList || !Number.isFinite(chapter)) return;
  const n = Math.floor(chapter);
  const cur = getLists()[manga.id];
  if (cur && cur.progress >= n) return;
  if (cur && cur.status !== "CURRENT" && cur.status !== "REPEATING" && cur.status !== "PLANNING") return;
  const done = !!manga.chapters && n >= manga.chapters;
  setListEntry({
    ...manga,
    type: "MANGA",
    status: done ? "COMPLETED" : cur?.status === "REPEATING" ? "REPEATING" : "CURRENT",
    progress: n,
    score: cur?.score ?? 0,
    from: cur?.from ?? "site",
    ...keepDetails(cur, done ? "COMPLETED" : "CURRENT"),
  });
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
  setListEntry({
    ...anime,
    status,
    progress: cur?.progress ?? 0,
    score: cur?.score ?? 0,
    from: cur?.from ?? "site",
    ...keepDetails(cur, status),
  });
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

/** Forget this browser's library: lists, history, favourites, profile. Used when another account signs in here. */
export function clearLibrary() {
  try {
    for (const k of [HISTORY_KEY, LIST_KEY, LISTS_KEY, FAVORITES_KEY, CUSTOM_KEY, PROFILE_KEY, SEEN_KEY, REMOVED_KEY]) localStorage.removeItem(k);
    for (const k of Object.keys(localStorage)) if (k.startsWith(POS_PREFIX)) localStorage.removeItem(k);
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(STORAGE_EVENT));
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
export type Prefs = {
  /** Play the next episode when one ends. */
  autoplay: boolean;
  /** Start playing as soon as an episode opens. */
  autoStart: boolean;
  autoSkip: boolean;
  audio?: Audio;
  hideSpoilers: boolean;
  /** Starting server for shows without their own choice; "" = automatic (first available). */
  preferredSource: string;
  /** Server picked per show (anime id → provider id); takes priority. */
  sourceFor: Record<string, string>;
  episodeLayout: "auto" | "list" | "grid";
  /** Manga source whose chapters come first; "" = automatic (the default order). */
  mangaSource: string;
  /** Open a chapter from the fastest other source when one fails or loads slowly. */
  mangaAutoSwitch: boolean;
  /** Stop recording history and positions in this browser. */
  pauseHistory: boolean;
  /** Show Continue Watching on the home page. */
  homeHistory: boolean;
  /** Move "Watching"/"Re-watching" list progress along as episodes are finished. */
  autoSyncList: boolean;
  /** Share of an episode (0–1) that counts as watched. */
  syncThreshold: number;
  /** Where clicking an anime card goes. */
  openOn: "info" | "watch";
  theme: "dark" | "black";
  /** Accent colour preset id (see ACCENTS). */
  accent: string;
  /** Corner roundness, 0–100 (50 = default). */
  radius: number;
  cardSize: "medium" | "large";
};

export { ACCENTS } from "./state";

const DEFAULT_PREFS: Prefs = {
  autoplay: true,
  autoStart: true,
  autoSkip: false,
  hideSpoilers: true,
  preferredSource: "",
  sourceFor: {},
  episodeLayout: "auto",
  mangaSource: "",
  mangaAutoSwitch: true,
  pauseHistory: false,
  homeHistory: true,
  autoSyncList: true,
  syncThreshold: 0.8,
  openOn: "info",
  theme: "dark",
  accent: "pink",
  radius: 50,
  cardSize: "medium",
};

export const APPEARANCE_EVENT = "as:appearance";

export function getPrefs(): Prefs {
  return { ...DEFAULT_PREFS, ...read<Partial<Prefs>>(PREFS_KEY, {}) };
}

/** Put every preference back to its default (lists and history are untouched). */
export function resetPrefs() {
  write(PREFS_KEY, DEFAULT_PREFS, false);
  window.dispatchEvent(new Event(APPEARANCE_EVENT));
}

/** Calls `fn` whenever preferences change, here or in another tab. Returns the unsubscribe. */
export function onPrefsChange(fn: () => void): () => void {
  const other = (e: StorageEvent) => (e.key === PREFS_KEY || e.key === null) && fn();
  window.addEventListener(APPEARANCE_EVENT, fn);
  window.addEventListener("storage", other);
  return () => {
    window.removeEventListener(APPEARANCE_EVENT, fn);
    window.removeEventListener("storage", other);
  };
}

export function setPrefs(p: Partial<Prefs>) {
  write(PREFS_KEY, { ...getPrefs(), ...p }, false);
  window.dispatchEvent(new Event(APPEARANCE_EVENT));
}
