import { NextResponse } from "next/server";
import { getManga } from "@/lib/anilist";
import { findMangaDexId, getChapters } from "@/lib/manga/mangadex";

// GET /api/manga/chapters?id=<anilistId> → { chapters } (readable English chapters, oldest first)
export async function GET(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const m = await getManga(id).catch(() => null);
  if (!m) return NextResponse.json({ error: "Manga not found" }, { status: 404 });

  try {
    const mdId = await findMangaDexId(m.id, m.title);
    const chapters = mdId ? await getChapters(mdId) : [];
    return NextResponse.json(
      { chapters },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800" } },
    );
  } catch (e) {
    console.error("[api/manga/chapters]", e);
    return NextResponse.json({ error: "Couldn't load chapters" }, { status: 502 });
  }
}
