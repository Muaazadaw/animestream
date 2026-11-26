// The viewer's library as one document: watch history, playback positions,
// watchlist and imported AniList/MAL lists. The browser keeps a copy in
// localStorage; signed-in accounts also keep one on the server, and the two are
// merged entry by entry (newest wins) so several devices can watch at once.

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

export type WatchlistEntry = SavedAnime & { addedAt?: number };

export type ListStatus = "CURRENT" | "PLANNING" | "COMPLETED" | "PAUSED" | "DROPPED" | "REPEATING";

export const LIST_STATUSES: { id: ListStatus; label: string }[] = [
  { id: "CURRENT", label: "Watching" },
  { id: "PLANNING", label: "Planning" },
  { id: "COMPLETED", label: "Completed" },
  { id: "PAUSED", label: "Paused" },
  { id: "DROPPED", label: "Dropped" },
  { id: "REPEATING", label: "Rewatching" },
];

export type ListEntry = SavedAnime & {
  status: ListStatus;
  /** Episodes watched. */
  progress: number;
  /** 0–100, 0 = unscored. */
  score: number;
  updatedAt: number;
  from?: "anilist" | "mal" | "site";
};

/** Playback position of one episode; key is "<animeId>:<episode>". */
export type Position = { t: number; d: number; u?: number };

export type LibraryState = {
  history: HistoryEntry[];
  watchlist: WatchlistEntry[];
  positions: Record<string, Position>;
  lists: Record<string, ListEntry>;
  /** Deletions, so a removal on one device isn't undone by another: id → time. */
  removed: { history: Record<string, number>; watchlist: Record<string, number> };
};

export function emptyState(): LibraryState {
  return { history: [], watchlist: [], positions: {}, lists: {}, removed: { history: {}, watchlist: {} } };
}

function newer<T>(a: T | undefined, b: T | undefined, time: (x: T) => number): T | undefined {
  if (!a) return b;
  if (!b) return a;
  return time(b) > time(a) ? b : a;
}

function maxMap(a: Record<string, number> = {}, b: Record<string, number> = {}) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = Math.max(out[k] ?? 0, v);
  return out;
}

export function mergeState(a: Partial<LibraryState>, b: Partial<LibraryState>): LibraryState {
  const removed = {
    history: maxMap(a.removed?.history, b.removed?.history),
    watchlist: maxMap(a.removed?.watchlist, b.removed?.watchlist),
  };

  const history = new Map<number, HistoryEntry>();
  for (const h of [...(a.history ?? []), ...(b.history ?? [])]) {
    history.set(h.id, newer(history.get(h.id), h, (x) => x.updatedAt)!);
  }

  const watchlist = new Map<number, WatchlistEntry>();
  for (const w of [...(a.watchlist ?? []), ...(b.watchlist ?? [])]) {
    watchlist.set(w.id, newer(watchlist.get(w.id), w, (x) => x.addedAt ?? 0)!);
  }

  const positions: Record<string, Position> = { ...a.positions };
  for (const [k, p] of Object.entries(b.positions ?? {})) positions[k] = newer(positions[k], p, (x) => x.u ?? 0)!;

  const lists: Record<string, ListEntry> = { ...a.lists };
  for (const [k, l] of Object.entries(b.lists ?? {})) lists[k] = newer(lists[k], l, (x) => x.updatedAt)!;

  return {
    history: [...history.values()]
      .filter((h) => (removed.history[h.id] ?? 0) < h.updatedAt)
      .sort((x, y) => y.updatedAt - x.updatedAt)
      .slice(0, 200),
    watchlist: [...watchlist.values()]
      .filter((w) => (removed.watchlist[w.id] ?? -1) < (w.addedAt ?? 0))
      .sort((x, y) => (y.addedAt ?? 0) - (x.addedAt ?? 0)),
    positions,
    lists,
    removed,
  };
}
