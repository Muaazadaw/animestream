import { NextResponse } from "next/server";
import { getAnime } from "@/lib/anilist";
import { getEpisodeMeta } from "@/lib/extras";
import { episodesFor, toAnimeRef, withTimeout } from "@/lib/sources";

// GET /api/episodes?id=<anilistId>
// Every server's episode list plus episode titles / stills, for the watch page
// (which renders straight away and loads these in the background).
export async function GET(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const m = await getAnime(id).catch(() => null);
  if (!m) return NextResponse.json({ error: "Anime not found" }, { status: 404 });

  const [providers, meta] = await Promise.all([
    episodesFor(toAnimeRef(m)),
    // Episode titles/stills are nice to have: don't wait more than a few seconds for them.
    withTimeout(getEpisodeMeta(m), 4000, "episode details").catch(() => ({})),
  ]);

  return NextResponse.json(
    { providers: [...providers], meta, incomplete: !!providers.incomplete },
    {
      headers: {
        // Shared by everyone watching the same show. If a server was missing (e.g. still
        // waking up), cache only briefly so it appears on the next try.
        "Cache-Control": providers.incomplete
          ? "public, s-maxage=10"
          : "public, s-maxage=120, stale-while-revalidate=600",
      },
    },
  );
}
