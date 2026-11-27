import { NextResponse } from "next/server";
import { getManga } from "@/lib/anilist";
import { findMangaDexId, getChapters, type Chapter } from "@/lib/manga/mangadex";
import { getChapters as getMangaKatanaChapters } from "@/lib/manga/mangakatana";

// GET /api/manga/chapters?id=<anilistId> → { chapters } (readable English chapters, oldest first)
// MangaDex chapters come first; MangaKatana fills in the numbers MangaDex doesn't host.
export async function GET(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const m = await getManga(id).catch(() => null);
  if (!m) return NextResponse.json({ error: "Manga not found" }, { status: 404 });

  try {
    const [mangadex, mangakatana] = await Promise.all([
      findMangaDexId(m.id, m.title).then((mdId) => (mdId ? getChapters(mdId) : [])),
      getMangaKatanaChapters(m.title).catch((e) => (console.error("[api/manga/chapters] mangakatana", e), [] as Chapter[])),
    ]);
    const have = new Set(mangadex.map((c) => parseFloat(c.number)));
    const chapters = [...mangadex, ...mangakatana.filter((c) => !have.has(parseFloat(c.number)))].sort(
      (x, y) => parseFloat(x.number) - parseFloat(y.number),
    );
    return NextResponse.json(
      { chapters },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800" } },
    );
  } catch (e) {
    console.error("[api/manga/chapters]", e);
    return NextResponse.json({ error: "Couldn't load chapters" }, { status: 502 });
  }
}
