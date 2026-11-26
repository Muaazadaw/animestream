import { NextResponse } from "next/server";
import type { MediaTitle } from "@/lib/anilist";

// POST /api/anime-info { ids: number[] }
// Details for many shows at once (for list cards and notifications): airing
// status, year, score, next episode, sequels, and episodes aired in the last week.

export type InfoRelation = {
  relationType: string;
  node: {
    id: number;
    type: string;
    title: MediaTitle;
    coverImage: { large: string | null };
    bannerImage: string | null;
    format: string | null;
    status: string | null;
    season: string | null;
    seasonYear: number | null;
    startDate: { year: number | null; month: number | null; day: number | null };
  };
};

export type AnimeInfo = {
  id: number;
  title: MediaTitle;
  coverImage: { large: string | null };
  bannerImage: string | null;
  format: string | null;
  status: string | null;
  episodes: number | null;
  seasonYear: number | null;
  averageScore: number | null;
  nextAiringEpisode: { episode: number; airingAt: number } | null;
  relations: { edges: InfoRelation[] };
};

export type AiredEpisode = { mediaId: number; episode: number; airingAt: number };

export type AnimeInfoResponse = { media: Record<number, AnimeInfo>; aired: AiredEpisode[] };

const MAX_IDS = 300;
const TITLE = "title { romaji english native userPreferred }";

async function anilist<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
    // Cached per id set for 15 minutes.
    cache: "force-cache",
    next: { revalidate: 900 },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.errors) throw new Error(json?.errors?.[0]?.message ?? `AniList error ${res.status}`);
  return json.data as T;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { ids?: unknown };
  const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))]
    .slice(0, MAX_IDS);
  if (!ids.length) return NextResponse.json({ media: {}, aired: [] } satisfies AnimeInfoResponse);

  const now = Math.floor(Date.now() / 1000);
  // Round the window so the cache key stays stable for a while.
  const to = Math.ceil(now / 900) * 900;
  const from = to - 7 * 86400;

  const out: AnimeInfoResponse = { media: {}, aired: [] };
  try {
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50).sort((a, b) => a - b);
      const data = await anilist<{ media: { media: AnimeInfo[] }; aired: { airingSchedules: AiredEpisode[] } }>(
        `query ($ids: [Int], $from: Int, $to: Int) {
          media: Page(perPage: 50) {
            media(id_in: $ids, type: ANIME) {
              id ${TITLE} coverImage { large } bannerImage format status episodes seasonYear averageScore
              nextAiringEpisode { episode airingAt }
              relations { edges { relationType node {
                id type ${TITLE} coverImage { large } bannerImage format status season seasonYear startDate { year month day }
              } } }
            }
          }
          aired: Page(perPage: 50) {
            airingSchedules(mediaId_in: $ids, airingAt_greater: $from, airingAt_lesser: $to, sort: TIME_DESC) {
              mediaId episode airingAt
            }
          }
        }`,
        { ids: chunk, from, to },
      );
      for (const m of data.media.media) out.media[m.id] = m;
      out.aired.push(...data.aired.airingSchedules.filter((a) => a.airingAt <= now));
    }
  } catch (e) {
    console.error("[api/anime-info]", e);
    if (!Object.keys(out.media).length) return NextResponse.json({ error: "AniList is unavailable" }, { status: 502 });
  }
  return NextResponse.json(out);
}
