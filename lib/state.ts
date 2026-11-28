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
  /** "MANGA" for manga (progress counts chapters); anime when missing. */
  type?: "ANIME" | "MANGA";
  /** Manga only: total chapters, if known. */
  chapters?: number | null;
  /** Manga only: "KR" / "CN" / "TW" make it a manhwa or manhua (see formatLabel). */
  countryOfOrigin?: string | null;
};

const MANGA_FORMATS = new Set(["MANGA", "NOVEL", "ONE_SHOT"]);

/** Whether a saved entry is manga (older entries have no type, so the format decides). */
export function isManga(a: Pick<SavedAnime, "type" | "format">) {
  return a.type === "MANGA" || (!a.type && !!a.format && MANGA_FORMATS.has(a.format));
}

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
  /** "YYYY-MM-DD"; null when cleared, missing when never set. */
  startedAt?: string | null;
  completedAt?: string | null;
  /** Times rewatched / reread. */
  repeat?: number;
  notes?: string | null;
};

/** Playback position of one episode; key is "<animeId>:<episode>". */
export type Position = { t: number; d: number; u?: number };

/** Accent presets: [main, secondary]. */
export const ACCENTS: Record<string, { label: string; colors: [string, string] }> = {
  pink: { label: "Mayoi (default)", colors: ["#d03a73", "#6a40e0"] },
  rose: { label: "Bright pink", colors: ["#ff5c8a", "#a874ff"] },
  violet: { label: "Violet", colors: ["#b69cff", "#7c5cff"] },
  blue: { label: "Blue", colors: ["#4ea8ff", "#6c7bff"] },
  green: { label: "Green", colors: ["#3ddc97", "#22b3a6"] },
  orange: { label: "Orange", colors: ["#ff9f43", "#ff6b6b"] },
  red: { label: "Red", colors: ["#ff4d5e", "#ff7a59"] },
};

export type Favorite = SavedAnime & { on: boolean; updatedAt: number };

export type CustomList = {
  id: string;
  name: string;
  items: SavedAnime[];
  updatedAt: number;
  /** Kept as a tombstone so the deletion syncs. */
  deleted?: boolean;
};

export type AniListLink = {
  token: string;
  /** ms timestamp the token stops working. */
  expiresAt: number;
  userId: number;
  name: string;
  avatar: string | null;
  /** Push progress and status changes to AniList as they happen. */
  autoSync: boolean;
};

export type Profile = {
  avatar?: string | null;
  /** Two-way link via AniList login (needs the site's AniList client id). */
  anilist?: AniListLink | null;
  /** One-way link: a public AniList username whose list is re-imported automatically. */
  anilistUser?: string | null;
  updatedAt: number;
};

export type LibraryState = {
  history: HistoryEntry[];
  watchlist: WatchlistEntry[];
  positions: Record<string, Position>;
  lists: Record<string, ListEntry>;
  favorites: Record<string, Favorite>;
  customLists: Record<string, CustomList>;
  profile: Profile;
  /** Notification id → time marked read (positive) or marked unread again (negative). */
  seen: Record<string, number>;
  /** Deletions, so a removal on one device isn't undone by another: id → time. */
  removed: { history: Record<string, number>; watchlist: Record<string, number> };
};

export function emptyState(): LibraryState {
  return {
    history: [],
    watchlist: [],
    positions: {},
    lists: {},
    favorites: {},
    customLists: {},
    profile: { updatedAt: 0 },
    seen: {},
    removed: { history: {}, watchlist: {} },
  };
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

  const favorites: Record<string, Favorite> = { ...a.favorites };
  for (const [k, f] of Object.entries(b.favorites ?? {})) favorites[k] = newer(favorites[k], f, (x) => x.updatedAt)!;

  const customLists: Record<string, CustomList> = { ...a.customLists };
  for (const [k, c] of Object.entries(b.customLists ?? {})) customLists[k] = newer(customLists[k], c, (x) => x.updatedAt)!;

  const profile = newer(a.profile, b.profile, (x) => x.updatedAt) ?? { updatedAt: 0 };

  // Newest read/unread action wins; keep the 300 most recent.
  const seenAll: Record<string, number> = { ...a.seen };
  for (const [k, v] of Object.entries(b.seen ?? {})) {
    if (!(k in seenAll) || Math.abs(v) > Math.abs(seenAll[k])) seenAll[k] = v;
  }
  const seen = Object.fromEntries(
    Object.entries(seenAll)
      .sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]))
      .slice(0, 300),
  );

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
    favorites,
    customLists,
    profile,
    seen,
    removed,
  };
}
