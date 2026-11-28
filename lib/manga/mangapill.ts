// Chapters and pages scraped from MangaPill (https://mangapill.com), plain HTML with
// no Cloudflare. A manga is matched to AniList by title. Its image CDN refuses requests
// without a mangapill.com Referer, so pages go through /api/manga/image. Server only.

import type { MediaTitle } from "../anilist";
import type { LatestItem } from "./latest";
import type { Chapter } from "./mangadex";
import { decode, norm } from "./text";

const BASE = "https://mangapill.com";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  Accept: "text/html",
};
export const REFERER = `${BASE}/`;

/** Our chapter ids look like "mp-723-10232000": MangaPill's own chapter id ("723-10232000") with a prefix. */
export const CHAPTER_ID = /^mp-(\d+-\d+)$/;

async function page(url: string, revalidate: number): Promise<string | null> {
  const res = await fetch(url, { headers: HEADERS, next: { revalidate } }).catch(() => null);
  return res?.ok ? res.text() : null;
}

/** The MangaPill manga path ("723/chainsaw-man") for an AniList manga, or null if there's no exact title match. */
async function findManga(title: MediaTitle): Promise<string | null> {
  const wanted = new Set([title.english, title.romaji, title.native].filter(Boolean).map((t) => norm(t!)));
  for (const t of [title.english, title.romaji].filter(Boolean) as string[]) {
    const html = await page(`${BASE}/search?q=${encodeURIComponent(t)}`, 86400);
    if (!html) continue;
    // Each result: a link holding the title and, sometimes, one alternative title.
    const hits = html.matchAll(
      /<a href="\/manga\/([^"]+)" class="mb-2">\s*<div[^>]*>([^<]+)<\/div>\s*(?:<div[^>]*>([^<]*)<\/div>)?/g,
    );
    for (const [, path, name, alt] of hits) {
      if ([name, alt].some((n) => n && wanted.has(norm(decode(n))))) return path;
    }
  }
  return null;
}

/** Chapters MangaPill has for an AniList manga, oldest first. MangaPill doesn't show release dates. */
export async function getChapters(title: MediaTitle): Promise<Chapter[]> {
  const path = await findManga(title);
  if (!path) return [];
  const html = await page(`${BASE}/manga/${path}`, 600);
  if (!html) return [];
  const chapters: Chapter[] = [];
  const seen = new Set<string>();
  for (const [, id, label] of html.matchAll(/<a [^>]*href="\/chapters\/(\d+-\d+)\/[^"]*"[^>]*>([^<]+)<\/a>/g)) {
    // "Chapter 12.5", or a title; ids are 1 + the chapter number × 1000 ("723-10012500").
    const m = decode(label).match(/^Chapter\s+([\d.]+)\s*[:-]?\s*(.*)$/i);
    const number = m?.[1] ?? String((Number(id.split("-")[1]) % 10_000_000) / 1000);
    if (seen.has(number)) continue;
    seen.add(number);
    chapters.push({ id: `mp-${id}`, number, title: m ? m[2] || null : decode(label), pages: 0, group: null, publishedAt: null });
  }
  return chapters.reverse();
}

/** Newest chapters from MangaPill's latest-chapters page (matched to AniList by matchLatest). */
export async function getLatestItems(): Promise<LatestItem[]> {
  const html = await page(`${BASE}/chapters`, 300);
  if (!html) return [];
  const items: LatestItem[] = [];
  const cards = html.matchAll(
    /<a href="\/chapters\/(\d+-\d+)\/[^"]*" class="relative block">[\s\S]*?>#([\d.]+)<\/div>[\s\S]*?line-clamp-2 text-sm font-bold">([^<]+)<\/div>[\s\S]*?datetime="([^"]+)"/g,
  );
  for (const [, id, number, title, at] of cards) items.push({ names: [decode(title)], chapterId: `mp-${id}`, number, at });
  return items;
}

/** True for a page image on MangaPill's CDN. */
export function isImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "cdn.readdetectiveconan.com";
  } catch {
    return false;
  }
}

/** Page image URLs for a MangaPill chapter id. */
export async function getChapterPages(chapterId: string): Promise<{ pages: string[]; number: string } | null> {
  const m = chapterId.match(CHAPTER_ID);
  if (!m) return null;
  // Without the slug the site redirects to the full chapter address.
  const html = await page(`${BASE}/chapters/${m[1]}`, 300);
  if (!html) return null;
  const pages = [...html.matchAll(/<img class="js-page" data-src="([^"]+)"/g)].map((p) => p[1]);
  const number = html.match(/<h1[^>]*>[^<]*Chapter\s+([\d.]+)/i)?.[1] ?? String((Number(m[1].split("-")[1]) % 10_000_000) / 1000);
  return pages.length ? { pages, number } : null;
}
