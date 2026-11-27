import { Batoto } from "mangascrape";

const batoto = new Batoto();

// Batoto chapter titles look like "Chapter 12" or "Vol.2 Ch.12.5: Title".
function chapterNumber(title: string): string | null {
  const match = title.match(/ch(?:apter)?\.?\s*(\d+(?:\.\d+)?)/i);
  return match ? match[1] : null;
}

export async function searchManga(query: string) {
  try {
    const { results } = await batoto.search({ query });

    return results.map((manga) => ({
      id: manga.id,
      title: manga.title,
      cover: manga.poster || null,
      tags: manga.genres ?? [],
    }));
  } catch {
    return [];
  }
}

export async function getMangaDetails(id: string) {
  try {
    const manga = await batoto.id(id);

    return {
      id: manga.id,
      title: manga.title.original,
      altTitles: manga.title.alt ?? [],
      cover: manga.poster || null,
      description: manga.description || "",
      status: manga.status || "unknown",
      tags: manga.genres ?? [],
    };
  } catch {
    return null;
  }
}

export async function getMangaChapters(mangaId: string) {
  try {
    const manga = await batoto.id(mangaId);
    const language = manga.languages?.translated || "en";

    return manga.chapters.map((chapter) => ({
      id: chapter.id,
      chapter: chapterNumber(chapter.title),
      title: chapter.title || null,
      translatedLanguage: language,
    }));
  } catch {
    return [];
  }
}

export async function getChapterPages(mangaId: string, chapterId: string) {
  try {
    return await batoto.chapter(mangaId, chapterId);
  } catch {
    return [];
  }
}
