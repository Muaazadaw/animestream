import { NextResponse } from "next/server";
import { getManga } from "@/lib/anilist";
import { findMangaDexId, getChapters, getChapterTitles, type Chapter } from "@/lib/manga/mangadex";
import { getChapters as getAsuraChapters } from "@/lib/manga/asura";
import { getChapters as getMangaKatanaChapters } from "@/lib/manga/mangakatana";
import { getChapters as getMangaPillChapters } from "@/lib/manga/mangapill";
import type { SourceChapters } from "@/lib/manga/sources";

// A scraped source that fails or is blocked just adds no chapters.
const scraped = (name: string, p: Promise<Chapter[]>) =>
  p.catch((e) => (console.error(`[api/manga/chapters] ${name}`, e), [] as Chapter[]));

// GET /api/manga/chapters?id=<anilistId> → { sources } (each source's readable English chapters,
// oldest first; sources without any are left out). The browser merges them (see mergeChapters),
// so the reader's preferred source can go first.
// Chapters without a name get the one MangaDex lists for that number, if any.
export async function GET(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const m = await getManga(id).catch(() => null);
  if (!m) return NextResponse.json({ error: "Manga not found" }, { status: 404 });

  // Novels have no readable chapters yet: the comic sites only carry the manga adaptation,
  // which a title match would otherwise put on the novel's page.
  if (m.format === "NOVEL") {
    return NextResponse.json({ sources: {} }, { headers: { "Cache-Control": "public, s-maxage=3600" } });
  }

  try {
    const mdId = await findMangaDexId(m.id, m.title);
    const [mangadex, asura, mangakatana, mangapill, titles] = await Promise.all([
      mdId ? getChapters(mdId) : [],
      scraped("asura", getAsuraChapters(m.title)),
      scraped("mangakatana", getMangaKatanaChapters(m.title)),
      scraped("mangapill", getMangaPillChapters(m.title)),
      mdId ? getChapterTitles(mdId).catch(() => new Map<string, string>()) : new Map<string, string>(),
    ]);
    const sources: SourceChapters = {};
    for (const [key, list] of Object.entries({ mangadex, asura, mangakatana, mangapill }) as [keyof SourceChapters, Chapter[]][]) {
      if (list.length) sources[key] = list.map((c) => (c.title ? c : { ...c, title: titles.get(String(parseFloat(c.number))) ?? null }));
    }
    return NextResponse.json(
      { sources },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800" } },
    );
  } catch (e) {
    console.error("[api/manga/chapters]", e);
    return NextResponse.json({ error: "Couldn't load chapters" }, { status: 502 });
  }
}
