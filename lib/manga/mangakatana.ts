// Chapters and pages scraped from MangaKatana (https://mangakatana.com), used to
// fill in chapters MangaDex doesn't host. Ported from the mangal Lua scraper.
// A manga is matched to AniList by title. Server only.

import type { MediaTitle } from "../anilist";
import type { LatestItem } from "./latest";
import type { Chapter } from "./mangadex";
import { decode, norm } from "./text";

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

// "26 minutes ago", "3 hours ago", or a date like "Nov-20-2026".
function updatedAt(text: string, now: number): string | null {
  const rel = text.match(/(\d+)\s+(second|minute|hour|day|week|month)s?\s+ago/i);
  if (rel) {
    const unit = { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800, month: 2592000 }[rel[2].toLowerCase()]!;
    return new Date(now - Number(rel[1]) * unit * 1000).toISOString();
  }
  const date = new Date(`${text.replace(/-/g, " ")} UTC`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Newest chapters from MangaKatana's latest-updates pages (matched to AniList by matchLatest). */
export async function getLatestItems(pages = 10): Promise<LatestItem[]> {
  const now = Date.now();
  const htmls = await Promise.all(Array.from({ length: pages }, (_, i) => page(i ? `${BASE}/page/${i + 1}` : BASE, 300)));
  const items: LatestItem[] = [];
  for (const res of htmls) {
    const list = res?.html.match(/id="book_list"[\s\S]*?id="col_right"/)?.[0] ?? "";
    for (const item of list.split('<div class="item"').slice(1)) {
      const id = item.match(/data-id="(\d+)"/)?.[1];
      const title = item.match(/<h3 class="title">\s*<a [^>]*>([^<]+)<\/a>/)?.[1];
      const path = item.match(/<div class="chapter"><a href="[^"]+\/(c[\w.-]+)"/)?.[1];
      const at = updatedAt(item.match(/<div class="date">(?:<i[^>]*><\/i>)?([^<]+)/)?.[1] ?? "", now);
      if (id && title && path && at) items.push({ names: [decode(title)], chapterId: `mk-${id}-${path}`, number: path.slice(1), at });
    }
  }
  return items;
}

/** True for a page image on MangaKatana's image servers (i1.mangakatana.com and the like). */
export function isImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && /^i\d*\.mangakatana\.com$/.test(u.hostname);
  } catch {
    return false;
  }
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
