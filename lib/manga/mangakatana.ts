// Chapters and pages scraped from MangaKatana (https://mangakatana.com), used to
// fill in chapters MangaDex doesn't host. Ported from the mangal Lua scraper.
// A manga is matched to AniList by title. Server only.

import type { MediaTitle } from "../anilist";
import type { Chapter } from "./mangadex";

const BASE = "https://mangakatana.com";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  Accept: "text/html",
};

/** Our chapter ids look like "mk-24674-c12.5": the MangaKatana manga id and chapter path. */
export const CHAPTER_ID = /^mk-(\d+)-(c[\w.-]+)$/;

// The page's own address comes from its canonical link: responses served from
// Next's fetch cache don't keep the URL a redirect landed on.
async function page(url: string, revalidate: number): Promise<{ html: string; url: string } | null> {
  const res = await fetch(url, { headers: HEADERS, next: { revalidate } }).catch(() => null);
  if (!res?.ok) return null;
  const html = await res.text();
  return { html, url: html.match(/<link rel="canonical" href="([^"]+)"/)?.[1] ?? url };
}

const decode = (s: string) =>
  s.replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

// Manga pages are /manga/<slug>.<id>; the slug doesn't matter, only the id.
const MANGA_URL = /^https:\/\/mangakatana\.com\/manga\/[^/"]+\.(\d+)\/?$/;

/** The manga page's names: its heading plus alternative titles. */
function names(html: string): string[] {
  const heading = html.match(/<h1 class="heading">([^<]+)/)?.[1] ?? "";
  const alt = html.match(/<div class="alt_name">([^<]+)/)?.[1] ?? "";
  return [heading, ...alt.split(/\s;\s/)].map(decode).filter(Boolean);
}

/** The MangaKatana manga page for an AniList manga, or null if there's no confident match. */
async function findManga(title: MediaTitle): Promise<{ id: string; html: string } | null> {
  const wanted = new Set([title.english, title.romaji, title.native].filter(Boolean).map((t) => norm(t!)));
  for (const t of [title.english, title.romaji].filter(Boolean) as string[]) {
    const res = await page(`${BASE}/?search=${encodeURIComponent(t)}&search_by=book_name`, 86400);
    if (!res) continue;

    // A single hit redirects straight to the manga.
    const direct = res.url.match(MANGA_URL);
    if (direct && names(res.html).some((n) => wanted.has(norm(n)))) return { id: direct[1], html: res.html };

    // Only the result list; the sidebar's "hot" titles use the same markup.
    const list = res.html.match(/id="book_list"[\s\S]*?id="col_right"/)?.[0] ?? "";
    const hits = [...list.matchAll(/<h3 class="title">\s*<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g)];
    // Check the closest few results against all of their alternative titles.
    const ranked = [...hits].sort((a, b) => Number(wanted.has(norm(decode(b[2])))) - Number(wanted.has(norm(decode(a[2])))));
    for (const [, href] of ranked.slice(0, 3)) {
      const id = href.match(MANGA_URL)?.[1];
      if (!id) continue;
      const manga = await page(href, 600);
      if (manga && names(manga.html).some((n) => wanted.has(norm(n)))) return { id, html: manga.html };
    }
  }
  return null;
}

/** Chapters MangaKatana has for an AniList manga, oldest first. */
export async function getChapters(title: MediaTitle): Promise<Chapter[]> {
  const manga = await findManga(title);
  if (!manga) return [];
  const table = manga.html.match(/<table class="uk-table[\s\S]*?<\/table>/)?.[0] ?? "";
  const rows = table.matchAll(
    /<div class="chapter"><a href="[^"]+\/(c[\w.-]+)">([^<]+)<\/a><\/div><\/td>\s*<td><div class="update_time">([^<]*)/g,
  );
  const chapters: Chapter[] = [];
  for (const [, path, name, updated] of rows) {
    const date = new Date(`${updated.replace(/-/g, " ")} UTC`);
    chapters.push({
      id: `mk-${manga.id}-${path}`,
      number: path.slice(1),
      title: decode(name).replace(/^Chapter\s+[\d.]+\s*:?\s*/i, "") || null,
      pages: 0,
      group: null,
      publishedAt: Number.isNaN(date.getTime()) ? null : date.toISOString(),
    });
  }
  return chapters.reverse();
}

/** Page image URLs for a MangaKatana chapter id. */
export async function getChapterPages(chapterId: string): Promise<{ pages: string[]; number: string } | null> {
  const m = chapterId.match(CHAPTER_ID);
  if (!m) return null;
  const res = await page(`${BASE}/manga/m.${m[1]}/${m[2]}`, 300);
  // The real list is the "thzq" array; the page has decoy arrays too.
  const list = res?.html.match(/var thzq=\[([^\]]*)\]/)?.[1];
  if (!list) return null;
  const pages = [...list.matchAll(/'(https?:\/\/[^']+)'/g)].map((p) => p[1]);
  return pages.length ? { pages, number: m[2].slice(1) } : null;
}
