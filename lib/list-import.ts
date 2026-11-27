// Turning AniList / MAL list entries into the site's library format. Shared by
// the server import route and the browser-side AniList sync.

import { titleOf, type MediaTitle } from "./anilist";
import type { Favorite, HistoryEntry, LibraryState, ListEntry, ListStatus, SavedAnime } from "./state";

export type ImportMedia = {
  id: number;
  idMal?: number | null;
  title: MediaTitle;
  coverImage: { large: string | null };
  format: string | null;
  episodes: number | null;
  type?: string | null;
  chapters?: number | null;
};

export type ImportedEntry = {
  media: ImportMedia;
  status: ListStatus;
  progress: number;
  score: number;
  updatedAt: number;
  startedAt?: string | null;
  completedAt?: string | null;
  repeat?: number;
  notes?: string | null;
};

type FuzzyDate = { year: number | null; month: number | null; day: number | null } | null;
const ENTRY_FIELDS = "status progress score(format: POINT_100) updatedAt startedAt { year month day } completedAt { year month day } repeat notes";

/** AniList's { year, month, day } as "YYYY-MM-DD" (missing parts become 01), or null. */
function dateString(d: FuzzyDate): string | null {
  if (!d?.year) return null;
  const pad = (n: number | null) => String(n ?? 1).padStart(2, "0");
  return `${d.year}-${pad(d.month)}-${pad(d.day)}`;
}

export const IMPORT_MEDIA_FIELDS = "id idMal title { romaji english native userPreferred } coverImage { large } format episodes type chapters";

/** Lists + favourites for one AniList user, by name or id. Works with or without a token (token adds private lists). */
export const ANILIST_USER_LISTS_QUERY = `query ($user: String, $userId: Int) {
  User(name: $user, id: $userId) {
    id name avatar { large }
    favourites {
      anime(perPage: 50) { nodes { ${IMPORT_MEDIA_FIELDS} } }
      manga(perPage: 50) { nodes { ${IMPORT_MEDIA_FIELDS} } }
    }
  }
  MediaListCollection(userName: $user, userId: $userId, type: ANIME) {
    lists { entries { ${ENTRY_FIELDS} media { ${IMPORT_MEDIA_FIELDS} } } }
  }
  mangaLists: MediaListCollection(userName: $user, userId: $userId, type: MANGA) {
    lists { entries { ${ENTRY_FIELDS} media { ${IMPORT_MEDIA_FIELDS} } } }
  }
}`;

type AniListLists = {
  lists: {
    entries: {
      status: ListStatus;
      progress: number;
      score: number;
      updatedAt: number;
      startedAt?: FuzzyDate;
      completedAt?: FuzzyDate;
      repeat?: number | null;
      notes?: string | null;
      media: ImportMedia;
    }[];
  }[];
};

export type AniListUserListsData = {
  User: {
    id: number;
    name: string;
    avatar: { large: string | null };
    favourites: { anime: { nodes: ImportMedia[] }; manga?: { nodes: ImportMedia[] } };
  } | null;
  MediaListCollection: AniListLists;
  mangaLists?: AniListLists | null;
};

/** Favourited anime and manga. */
export function favouritesFromAniList(data: AniListUserListsData): ImportMedia[] {
  const f = data.User?.favourites;
  return [...(f?.anime.nodes ?? []), ...(f?.manga?.nodes ?? [])];
}

export function entriesFromAniList(data: AniListUserListsData): ImportedEntry[] {
  return [data.MediaListCollection, data.mangaLists].flatMap((c) =>
    (c?.lists ?? []).flatMap((l) =>
      l.entries.map((e) => ({
        ...e,
        updatedAt: (e.updatedAt || 0) * 1000,
        startedAt: dateString(e.startedAt ?? null),
        completedAt: dateString(e.completedAt ?? null),
        repeat: e.repeat ?? 0,
        notes: e.notes || null,
      })),
    ),
  );
}

function savedAnime(m: ImportMedia): SavedAnime {
  const base = { id: m.id, title: titleOf(m.title), cover: m.coverImage.large, format: m.format, episodes: m.episodes };
  return m.type === "MANGA" ? { ...base, type: "MANGA", chapters: m.chapters ?? null } : base;
}

export function toLibraryState(entries: ImportedEntry[], from: "anilist" | "mal", favoriteMedia: ImportMedia[] = []) {
  const lists: Record<string, ListEntry> = {};
  const history: HistoryEntry[] = [];
  for (const e of entries) {
    const anime = savedAnime(e.media);
    lists[anime.id] = {
      ...anime,
      status: e.status,
      progress: e.progress,
      score: e.score,
      updatedAt: e.updatedAt,
      from,
      ...(e.startedAt !== undefined ? { startedAt: e.startedAt, completedAt: e.completedAt, repeat: e.repeat, notes: e.notes } : {}),
    };

    // Shows in progress go to "continue watching", on the next unwatched episode.
    if (anime.type !== "MANGA" && (e.status === "CURRENT" || e.status === "REPEATING")) {
      const next = anime.episodes ? Math.min(e.progress + 1, anime.episodes) : e.progress + 1;
      history.push({ ...anime, episode: next, time: 0, duration: 0, updatedAt: e.updatedAt });
    }
  }

  // Favourites carry no timestamp, so they count as set at the time of the oldest
  // list entry: a favourite toggled on this site later still wins.
  const favorites: Record<string, Favorite> = {};
  for (const m of favoriteMedia) favorites[m.id] = { ...savedAnime(m), on: true, updatedAt: 1 };

  const counts = Object.values(lists).reduce<Record<string, number>>((c, l) => ((c[l.status] = (c[l.status] ?? 0) + 1), c), {});
  return {
    state: { lists, history, favorites } satisfies Partial<LibraryState>,
    counts,
    total: entries.length,
  };
}
