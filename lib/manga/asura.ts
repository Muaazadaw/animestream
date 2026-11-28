// Chapters and pages from Asura Scans' JSON API (api.asurascans.com), mostly manhwa.
// A manga is matched to AniList by title and alternative titles. The API sits behind
// Cloudflare but lets a browser User-Agent through; images load directly. Server only.

import type { MediaTitle } from "../anilist";
import type { LatestItem } from "./latest";
import type { Chapter } from "./mangadex";
import { norm } from "./text";

const API = "https://api.asurascans.com/api";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  Accept: "application/json",
};

/** Our chapter ids look like "as-solo-leveling-7de80a82-12.5": the series' hashed slug and the chapter number. */
export const CHAPTER_ID = /^as-([a-z0-9-]+)-(\d+(?:\.\d+)?)$/;

// A Cloudflare challenge comes back as HTML, so anything that isn't JSON counts as a miss.
async function get<T>(path: string, revalidate: number): Promise<T | null> {
  const res = await fetch(`${API}${path}`, { headers: HEADERS, next: { revalidate } }).catch(() => null);
  if (!res?.ok || !res.headers.get("content-type")?.includes("json")) return null;
  return (await res.json().catch(() => null)) as T | null;
}

type AsSeries = { title: string; alt_titles?: string[] | null; public_url?: string | null; slug: string };
type AsChapter = {
  number: number;
  title?: string | null;
  is_premium: boolean;
  early_access_until?: string | null;
  published_at: string | null;
};

/** The hashed slug ("solo-leveling-7de80a82") the chapter endpoints want, from "/comics/<slug>". */
const slugOf = (s: AsSeries) => s.public_url?.match(/^\/comics\/([^/]+)/)?.[1] ?? s.slug;

async function findSeries(title: MediaTitle): Promise<string | null> {
  const wanted = new Set([title.english, title.romaji, title.native].filter(Boolean).map((t) => norm(t!)));
  for (const t of [title.english, title.romaji].filter(Boolean) as string[]) {
    // No results come back as `data: null`.
    const data = await get<{ data: AsSeries[] | null }>(`/series?search=${encodeURIComponent(t)}`, 86400);
    const hit = data?.data?.find((s) => [s.title, ...(s.alt_titles ?? [])].some((n) => wanted.has(norm(n))));
    if (hit) return slugOf(hit);
  }
  return null;
}

/** Chapters Asura Scans has for an AniList manga, oldest first. Early-access chapters still locked are left out. */
export async function getChapters(title: MediaTitle): Promise<Chapter[]> {
  const slug = await findSeries(title);
  if (!slug) return [];
  const data = await get<{ data: AsChapter[] }>(`/series/${slug}/chapters`, 600);
  const now = Date.now();
  return (data?.data ?? [])
    .filter((c) => !(c.is_premium && c.early_access_until && Date.parse(c.early_access_until) > now))
    .map((c) => ({
      id: `as-${slug}-${c.number}`,
      number: String(c.number),
      title: c.title?.trim() || null,
      pages: 0,
      group: "Asura Scans",
      publishedAt: c.published_at,
    }))
    .reverse();
}

/** The newest readable chapter of each recently updated series (matched to AniList by matchLatest). */
export async function getLatestItems(): Promise<LatestItem[]> {
  const data = await get<{ data: (AsSeries & { latest_chapters?: AsChapter[] | null })[] | null }>(
    "/series?sort=updated&per_page=40",
    300,
  );
  const now = Date.now();
  const items: LatestItem[] = [];
  for (const s of data?.data ?? []) {
    const c = s.latest_chapters?.find((c) => !(c.is_premium && c.early_access_until && Date.parse(c.early_access_until) > now));
    if (c?.published_at) {
      items.push({ names: [s.title, ...(s.alt_titles ?? [])], chapterId: `as-${slugOf(s)}-${c.number}`, number: String(c.number), at: c.published_at });
    }
  }
  return items;
}

/** Page image URLs for an Asura chapter id, or null if it's locked or gone. */
export async function getChapterPages(chapterId: string): Promise<{ pages: string[]; number: string } | null> {
  const m = chapterId.match(CHAPTER_ID);
  if (!m) return null;
  const data = await get<{ data: { is_locked?: boolean; chapter: { pages?: { url: string }[] | null } } }>(
    `/series/${m[1]}/chapters/${m[2]}`,
    300,
  );
  const pages = data && !data.data.is_locked ? (data.data.chapter.pages ?? []).map((p) => p.url).filter(Boolean) : [];
  return pages.length ? { pages, number: m[2] } : null;
}
