import { getChapterPages } from "./mangadex";
import { getBatotoChapterPages } from "./batoto";

export type ChapterPagesResult = {
  source: "mangadex" | "batoto";
  pages: string[];
  saver?: string[];
  number?: string | null;
  group?: string | null;
};

export async function resolveChapterPages(
  chapterId: string
): Promise<ChapterPagesResult | null> {
  // Batoto chapter IDs look like:
  // batoto:MANGA_ID:CHAPTER_ID
  if (chapterId.startsWith("batoto:")) {
    const [, mangaId, batotoChapterId] = chapterId.split(":");

    const pages = await getBatotoChapterPages(
      mangaId,
      batotoChapterId
    );

    if (!pages.length) return null;

    return {
      source: "batoto",
      pages,
    };
  }

  // MangaDex chapter
  const mangadex = await getChapterPages(chapterId);

  if (!mangadex) return null;

  return {
    source: "mangadex",
    pages: mangadex.pages,
    saver: mangadex.saver,
    number: mangadex.number,
    group: mangadex.group,
  };
}