import { NextResponse } from "next/server";
import { getManga } from "@/lib/anilist";
import { findMangaDexId, getChapters, getChapterTitles, type Chapter } from "@/lib/manga/mangadex";
import { getChapters as getMangaKatanaChapters } from "@/lib/manga/mangakatana";

// GET /api/manga/chapters?id=<anilistId> → { chapters } (readable English chapters, oldest first)
// MangaDex chapters come first; MangaKatana fills in the numbers MangaDex doesn't host.
// Chapters without a name get the one MangaDex lists for that number, if any.
export async function GET(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const m = await getManga(id).catch(() => null);
  if (!m) return NextResponse.json({ error: "Manga not found" }, { status: 404 });

  try {
    const mdId = await findMangaDexId(m.id, m.title);
    const [mangadex, mangakatana, titles] = await Promise.all([
      mdId ? getChapters(mdId) : [],
      getMangaKatanaChapters(m.title).catch((e) => (console.error("[api/manga/chapters] mangakatana", e), [] as Chapter[])),
      mdId ? getChapterTitles(mdId).catch(() => new Map<string, string>()) : new Map<string, string>(),
    ]);
    const have = new Set(mangadex.map((c) => parseFloat(c.number)));
    const chapters = [...mangadex, ...mangakatana.filter((c) => !have.has(parseFloat(c.number)))]
      .map((c) => (c.title ? c : { ...c, title: titles.get(String(parseFloat(c.number))) ?? null }))
      .sort((x, y) => parseFloat(x.number) - parseFloat(y.number));
    return NextResponse.json(
      { chapters },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800" } },
    );
  } catch (e) {
    console.error("[api/manga/chapters]", e);
    return NextResponse.json({ error: "Couldn't load chapters" }, { status: 502 });
  }
}
