import { NextResponse } from "next/server";
import { getChapterPages } from "@/lib/manga/mangadex";
import { CHAPTER_ID as ASURA_ID, getChapterPages as getAsuraPages } from "@/lib/manga/asura";
import { CHAPTER_ID as MANGAKATANA_ID, getChapterPages as getMangaKatanaPages } from "@/lib/manga/mangakatana";
import { CHAPTER_ID as MANGAPILL_ID, getChapterPages as getMangaPillPages } from "@/lib/manga/mangapill";

// Scraped sources: where the pages come from, and whether they go through /api/manga/image.
// MangaKatana's image server is slow per connection and MangaPill's wants its own Referer
// (see there); Asura's images load fine directly. None has data-saver images.
const SCRAPED = [
  { id: MANGAKATANA_ID, pages: getMangaKatanaPages, proxy: true, group: null },
  { id: MANGAPILL_ID, pages: getMangaPillPages, proxy: true, group: null },
  { id: ASURA_ID, pages: getAsuraPages, proxy: false, group: "Asura Scans" },
];

// GET /api/manga/pages?chapter=<MangaDex chapter id | mk-… | mp-… | as-…> → { pages, saver }
export async function GET(req: Request) {
  const chapter = new URL(req.url).searchParams.get("chapter") ?? "";

  const source = SCRAPED.find((s) => s.id.test(chapter));
  if (source) {
    const res = await source.pages(chapter);
    if (!res) return NextResponse.json({ error: "Couldn't load this chapter" }, { status: 404 });
    const pages = source.proxy ? res.pages.map((p) => `/api/manga/image?u=${encodeURIComponent(p)}`) : res.pages;
    return NextResponse.json(
      { pages, saver: pages, number: res.number, group: source.group },
      { headers: { "Cache-Control": "public, s-maxage=300" } },
    );
  }

  if (!/^[0-9a-f-]{36}$/i.test(chapter)) return NextResponse.json({ error: "Invalid chapter" }, { status: 400 });

  const pages = await getChapterPages(chapter);
  if (!pages || pages.pages.length === 0) return NextResponse.json({ error: "Couldn't load this chapter" }, { status: 404 });
  // The image links expire after ~15 minutes, so only cache briefly.
  return NextResponse.json(pages, { headers: { "Cache-Control": "public, s-maxage=300" } });
}
