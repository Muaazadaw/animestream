// Turning AniList / MAL list entries into the site's library format. Shared by
// the server import route and the browser-side AniList sync.

import { titleOf, type MediaTitle } from "./anilist";
import type { Favorite, HistoryEntry, LibraryState, ListEntry, ListStatus } from "./state";

export type ImportMedia = {
  id: number;
  idMal?: number | null;
  title: MediaTitle;
  coverImage: { large: string | null };
  format: string | null;
  episodes: number | null;
};

export type ImportedEntry = { media: ImportMedia; status: ListStatus; progress: number; score: number; updatedAt: number };

export const IMPORT_MEDIA_FIELDS = "id idMal title { romaji english native userPreferred } coverImage { large } format episodes";

/** Lists + favourites for one AniList user, by name or id. Works with or without a token (token adds private lists). */
export const ANILIST_USER_LISTS_QUERY = `query ($user: String, $userId: Int) {
  User(name: $user, id: $userId) {
    id name avatar { large }
    favourites { anime(perPage: 50) { nodes { ${IMPORT_MEDIA_FIELDS} } } }
  }
  MediaListCollection(userName: $user, userId: $userId, type: ANIME) {
    lists { entries { status progress score(format: POINT_100) updatedAt media { ${IMPORT_MEDIA_FIELDS} } } }
  }
}`;

export type AniListUserListsData = {
  User: { id: number; name: string; avatar: { large: string | null }; favourites: { anime: { nodes: ImportMedia[] } } } | null;
  MediaListCollection: {
    lists: { entries: { status: ListStatus; progress: number; score: number; updatedAt: number; media: ImportMedia }[] }[];
  };
};

export function entriesFromAniList(data: AniListUserListsData): ImportedEntry[] {
  return data.MediaListCollection.lists.flatMap((l) =>
    l.entries.map((e) => ({ ...e, updatedAt: (e.updatedAt || 0) * 1000 })),
  );
}

function savedAnime(m: ImportMedia) {
  return { id: m.id, title: titleOf(m.title), cover: m.coverImage.large, format: m.format, episodes: m.episodes };
}

export function toLibraryState(entries: ImportedEntry[], from: "anilist" | "mal", favoriteMedia: ImportMedia[] = []) {
  const lists: Record<string, ListEntry> = {};
  const history: HistoryEntry[] = [];
  for (const e of entries) {
    const anime = savedAnime(e.media);
    lists[anime.id] = { ...anime, status: e.status, progress: e.progress, score: e.score, updatedAt: e.updatedAt, from };

    // Shows in progress go to "continue watching", on the next unwatched episode.
    if (e.status === "CURRENT" || e.status === "REPEATING") {
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
