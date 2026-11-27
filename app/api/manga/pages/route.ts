import { NextResponse } from "next/server";
import { getChapterPages } from "@/lib/manga/mangadex";

// GET /api/manga/pages?chapter=<MangaDex chapter id> → { pages, saver }
export async function GET(req: Request) {
  const chapter = new URL(req.url).searchParams.get("chapter") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(chapter)) return NextResponse.json({ error: "Invalid chapter" }, { status: 400 });

  const pages = await getChapterPages(chapter);
  if (!pages || pages.pages.length === 0) return NextResponse.json({ error: "Couldn't load this chapter" }, { status: 404 });
  // The image links expire after ~15 minutes, so only cache briefly.
  return NextResponse.json(pages, { headers: { "Cache-Control": "public, s-maxage=300" } });
}
