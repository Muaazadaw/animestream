import { NextResponse } from "next/server";
import { resolveChapterPages } from "@/lib/manga/chapter-source";

// GET /api/manga/pages?chapter=<chapter-id>
// MangaDex chapter id: UUID
// Batoto chapter id: batoto:<mangaId>:<chapterId>

const MANGADEX_ID = /^[0-9a-f-]{36}$/i;
const BATOTO_ID = /^batoto:[^:]+:[^:]+$/i;

export async function GET(req: Request) {
  const chapter = new URL(req.url).searchParams.get("chapter") ?? "";

  if (!MANGADEX_ID.test(chapter) && !BATOTO_ID.test(chapter)) {
    return NextResponse.json(
      { error: "Invalid chapter" },
      { status: 400 }
    );
  }

  const result = await resolveChapterPages(chapter);

  if (!result || result.pages.length === 0) {
    return NextResponse.json(
      { error: "Couldn't load this chapter" },
      { status: 404 }
    );
  }

  // MangaDex image links expire after about 15 minutes.
  return NextResponse.json(
    {
      source: result.source,
      pages: result.pages,
      saver: result.saver ?? [],
      number: result.number ?? null,
      group: result.group ?? null,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300",
      },
    }
  );
}