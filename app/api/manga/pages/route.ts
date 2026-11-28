import { NextResponse } from "next/server";
import { getChapterPages } from "@/lib/manga/mangadex";
import { CHAPTER_ID as MANGAKATANA_ID, getChapterPages as getMangaKatanaPages } from "@/lib/manga/mangakatana";

// GET /api/manga/pages?chapter=<MangaDex chapter id | mk-<id>-<chapter>> → { pages, saver }
export async function GET(req: Request) {
  const chapter = new URL(req.url).searchParams.get("chapter") ?? "";

  if (MANGAKATANA_ID.test(chapter)) {
    const mk = await getMangaKatanaPages(chapter);
    if (!mk) return NextResponse.json({ error: "Couldn't load this chapter" }, { status: 404 });
    // Served through /api/manga/image so a whole chapter can load at once (see there).
    // MangaKatana has no data-saver images, so both lists are the same.
    const pages = mk.pages.map((p) => `/api/manga/image?u=${encodeURIComponent(p)}`);
    return NextResponse.json(
      { pages, saver: pages, number: mk.number, group: null },
      { headers: { "Cache-Control": "public, s-maxage=300" } },
    );
  }

  if (!/^[0-9a-f-]{36}$/i.test(chapter)) return NextResponse.json({ error: "Invalid chapter" }, { status: 400 });

  const pages = await getChapterPages(chapter);
  if (!pages || pages.pages.length === 0) return NextResponse.json({ error: "Couldn't load this chapter" }, { status: 404 });
  // The image links expire after ~15 minutes, so only cache briefly.
  return NextResponse.json(pages, { headers: { "Cache-Control": "public, s-maxage=300" } });
}
