import { Batoto } from "mangascrape";

const batoto = new Batoto();

// Batoto chapter titles look like "Chapter 12" or "Vol.2 Ch.12.5: Title".
function chapterNumber(title: string): string {
  const match = title.match(/ch(?:apter)?\.?\s*(\d+(?:\.\d+)?)/i);
  return match ? match[1] : "";
}

export async function searchBatotoManga(title: string) {
  try {
    const { results } = await batoto.search({ query: title });

    return results.map((manga) => ({
      id: manga.id,
      title: manga.title,
      cover: manga.poster || null,
    }));
  } catch {
    return [];
  }
}

export async function getBatotoChapters(mangaId: string) {
  try {
    const manga = await batoto.id(mangaId);

    return manga.chapters.map((chapter) => ({
      id: `batoto:${mangaId}:${chapter.id}`,
      number: chapterNumber(chapter.title),
      title: chapter.title || null,
    }));
  } catch {
    return [];
  }
}

export async function getBatotoChapterPages(
  mangaId: string,
  chapterId: string
) {
  try {
    return await batoto.chapter(mangaId, chapterId);
  } catch {
    return [];
  }
}
