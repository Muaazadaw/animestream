import { NextResponse } from "next/server";
import {
  ANILIST_USER_LISTS_QUERY,
  entriesFromAniList,
  IMPORT_MEDIA_FIELDS as MEDIA,
  toLibraryState,
  type AniListUserListsData,
  type ImportedEntry as Imported,
  type ImportMedia as Media,
} from "@/lib/list-import";
import type { ListStatus } from "@/lib/state";

// POST /api/import { service: "anilist" | "mal", username }
// Reads a public AniList or MyAnimeList list and returns it as a partial
// LibraryState (lists, favourites, and "continue watching" for shows in
// progress). The browser merges it in, and syncs it to the account if signed in.

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

async function fromAniList(user: string) {
  const data = await anilist<AniListUserListsData>(ANILIST_USER_LISTS_QUERY, { user });
  return { entries: entriesFromAniList(data), user: data.User };
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
  let anilistUser: AniListUserListsData["User"] = null;
  try {
    if (body.service === "anilist") ({ entries, user: anilistUser } = await fromAniList(user));
    else if (body.service === "mal") entries = await fromMal(user);
    else return NextResponse.json({ error: "Unknown service" }, { status: 400 });
  } catch (e) {
    const msg = (e as Error).message;
    const notFound = /not found|private/i.test(msg);
    return NextResponse.json({ error: notFound ? msg.replace(/^User not found$/i, "AniList user not found (or the list is private).") : msg }, { status: notFound ? 404 : 502 });
  }

  const from = body.service === "mal" ? "mal" : "anilist";
  const favorites = from === "anilist" ? [...(anilistUser?.favourites.anime.nodes ?? []), ...(anilistUser?.favourites.manga?.nodes ?? [])] : [];
  const result = toLibraryState(entries, from, favorites);
  return NextResponse.json({ ...result, avatar: from === "anilist" ? (anilistUser?.avatar.large ?? null) : null });
}
