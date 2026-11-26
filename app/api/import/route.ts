import { NextResponse } from "next/server";
import { titleOf, type MediaTitle } from "@/lib/anilist";
import type { HistoryEntry, LibraryState, ListEntry, ListStatus } from "@/lib/state";

// POST /api/import { service: "anilist" | "mal", username }
// Reads a public AniList or MyAnimeList list and returns it as a partial
// LibraryState (lists + "continue watching" for shows in progress). The
// browser merges it in, and syncs it to the account if signed in.

type Media = {
  id: number;
  idMal?: number | null;
  title: MediaTitle;
  coverImage: { large: string | null };
  format: string | null;
  episodes: number | null;
};

const MEDIA = "id idMal title { romaji english native userPreferred } coverImage { large } format episodes";

async function anilist<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.errors) throw new Error(json?.errors?.[0]?.message ?? `AniList error ${res.status}`);
  return json.data as T;
}

type Imported = { media: Media; status: ListStatus; progress: number; score: number; updatedAt: number };

async function fromAniList(user: string): Promise<Imported[]> {
  const data = await anilist<{
    MediaListCollection: {
      lists: { entries: { status: ListStatus; progress: number; score: number; updatedAt: number; media: Media }[] }[];
    };
  }>(
    `query ($user: String) {
      MediaListCollection(userName: $user, type: ANIME) {
        lists { entries { status progress score(format: POINT_100) updatedAt media { ${MEDIA} } } }
      }
    }`,
    { user },
  );
  return data.MediaListCollection.lists.flatMap((l) =>
    l.entries.map((e) => ({ ...e, updatedAt: (e.updatedAt || 0) * 1000 })),
  );
}

const MAL_STATUS: Record<string, ListStatus> = {
  watching: "CURRENT",
  plan_to_watch: "PLANNING",
  completed: "COMPLETED",
  on_hold: "PAUSED",
  dropped: "DROPPED",
};

async function fromMal(user: string): Promise<Imported[]> {
  const clientId = process.env.MAL_CLIENT_ID;
  if (!clientId) throw new Error("MyAnimeList import needs MAL_CLIENT_ID set on the server (see .env.example).");

  type MalItem = {
    node: { id: number };
    list_status: { status: string; score: number; num_episodes_watched: number; is_rewatching: boolean; updated_at: string };
  };
  const items: MalItem[] = [];
  let url: string | undefined =
    `https://api.myanimelist.net/v2/users/${encodeURIComponent(user)}/animelist?fields=list_status&limit=1000&nsfw=true`;
  while (url && items.length < 10000) {
    const res = await fetch(url, { headers: { "X-MAL-CLIENT-ID": clientId }, cache: "no-store" });
    if (res.status === 404) throw new Error("MyAnimeList user not found.");
    if (res.status === 403) throw new Error("That MyAnimeList list is private.");
    if (!res.ok) throw new Error(`MyAnimeList error ${res.status}`);
    const page = (await res.json()) as { data: MalItem[]; paging?: { next?: string } };
    items.push(...page.data);
    url = page.paging?.next;
  }

  // MAL ids → AniList media, 50 at a time.
  const byMal = new Map<number, Media>();
  const ids = items.map((i) => i.node.id);
  for (let i = 0; i < ids.length; i += 50) {
    const data = await anilist<{ Page: { media: Media[] } }>(
      `query ($ids: [Int]) { Page(perPage: 50) { media(idMal_in: $ids, type: ANIME) { ${MEDIA} } } }`,
      { ids: ids.slice(i, i + 50) },
    );
    for (const m of data.Page.media) if (m.idMal) byMal.set(m.idMal, m);
  }

  return items.flatMap((i) => {
    const media = byMal.get(i.node.id);
    if (!media) return [];
    const s = i.list_status;
    return [
      {
        media,
        status: s.is_rewatching ? "REPEATING" : MAL_STATUS[s.status] ?? "PLANNING",
        progress: s.num_episodes_watched,
        score: s.score * 10,
        updatedAt: Date.parse(s.updated_at) || 0,
      },
    ];
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { service?: string; username?: string };
  const user = (body.username ?? "").trim();
  if (!user || !/^[\w-]{2,32}$/.test(user)) return NextResponse.json({ error: "Enter a valid username." }, { status: 400 });

  let entries: Imported[];
  try {
    if (body.service === "anilist") entries = await fromAniList(user);
    else if (body.service === "mal") entries = await fromMal(user);
    else return NextResponse.json({ error: "Unknown service" }, { status: 400 });
  } catch (e) {
    const msg = (e as Error).message;
    const notFound = /not found|private/i.test(msg);
    return NextResponse.json({ error: notFound ? msg.replace(/^User not found$/i, "AniList user not found (or the list is private).") : msg }, { status: notFound ? 404 : 502 });
  }

  const from = body.service === "mal" ? "mal" : "anilist";
  const lists: Record<string, ListEntry> = {};
  const history: HistoryEntry[] = [];
  for (const e of entries) {
    const anime = {
      id: e.media.id,
      title: titleOf(e.media.title),
      cover: e.media.coverImage.large,
      format: e.media.format,
      episodes: e.media.episodes,
    };
    lists[anime.id] = { ...anime, status: e.status, progress: e.progress, score: e.score, updatedAt: e.updatedAt, from };

    // Shows in progress go to "continue watching", on the next unwatched episode.
    if (e.status === "CURRENT" || e.status === "REPEATING") {
      const next = anime.episodes ? Math.min(e.progress + 1, anime.episodes) : e.progress + 1;
      history.push({ ...anime, episode: next, time: 0, duration: 0, updatedAt: e.updatedAt });
    }
  }

  const counts = Object.values(lists).reduce<Record<string, number>>((c, l) => ((c[l.status] = (c[l.status] ?? 0) + 1), c), {});
  return NextResponse.json({ state: { lists, history } satisfies Partial<LibraryState>, counts, total: entries.length });
}
