import { NextResponse } from "next/server";
import { quickSearch } from "@/lib/anilist";

// GET /api/search?q=<text> → { results } (anime and manga for the search box's dropdown)
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 100);
  if (q.length < 2) return NextResponse.json({ results: [] });
  try {
    return NextResponse.json(
      { results: await quickSearch(q) },
      { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } },
    );
  } catch (e) {
    console.error("[api/search]", e);
    return NextResponse.json({ results: [] }, { status: 502 });
  }
}
