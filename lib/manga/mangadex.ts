// Chapters and pages from MangaDex's public API (https://api.mangadex.org/docs).
// Manga info comes from AniList; MangaDex is matched to it through the AniList
// id it stores ("links.al"). Only chapters MangaDex hosts are listed; ones that
// just point to another site are left out. Server only.

import type { MediaTitle } from "../anilist";

const API = "https://api.mangadex.org";
// MangaDex asks API clients to identify themselves.
const HEADERS = { "User-Agent": "Mayoi/1.0 (+https://mayoi.co)", Accept: "application/json" };
const RATINGS = ["safe", "suggestive", "erotica"];

export type Chapter = {
  id: string;
  /** "12", "12.5"… */
  number: string;
  title: string | null;
  pages: number;
  /** Scanlation group, credited in the reader. */
  group: string | null;
  publishedAt: string | null;
};

async function get<T>(path: string, params: [string, string][], revalidate: number): Promise<T | null> {
  const qs = new URLSearchParams(params);
  const res = await fetch(`${API}${path}?${qs}`, { headers: HEADERS, next: { revalidate } }).catch(() => null);
  return res?.ok ? ((await res.json()) as T) : null;
}

type MdManga = { id: string; attributes: { links?: Record<string, string> | null } };

/** The MangaDex id for an AniList manga, or null if MangaDex doesn't have it. */
export async function findMangaDexId(anilistId: number, title: MediaTitle): Promise<string | null> {
  const titles = [...new Set([title.romaji, title.english, title.native].filter(Boolean) as string[])];
  for (const t of titles) {
    const data = await get<{ data: MdManga[] }>(
      "/manga",
      [
        ["title", t],
        ["limit", "20"],
        ["order[relevance]", "desc"],
        ...RATINGS.map((r): [string, string] => ["contentRating[]", r]),
      ],
      86400,
    );
    const hit = data?.data.find((m) => String(m.attributes.links?.al ?? "") === String(anilistId));
    if (hit) return hit.id;
  }
  return null;
}

type MdChapter = {
  id: string;
  attributes: { chapter: string | null; title: string | null; pages: number; externalUrl: string | null; publishAt: string | null };
  relationships: { type: string; attributes?: { name?: string } }[];
};

/** English chapters MangaDex hosts, oldest first, one per chapter number. */
export async function getChapters(mangaDexId: string): Promise<Chapter[]> {
  const all: MdChapter[] = [];
  for (let offset = 0; offset < 5000; offset += 500) {
    const data = await get<{ data: MdChapter[]; total: number }>(
      `/manga/${mangaDexId}/feed`,
      [
        ["translatedLanguage[]", "en"],
        ["includes[]", "scanlation_group"],
        ["order[chapter]", "asc"],
        ["limit", "500"],
        ["offset", String(offset)],
        ...RATINGS.map((r): [string, string] => ["contentRating[]", r]),
      ],
      600,
    );
    if (!data) break;
    all.push(...data.data);
    if (offset + 500 >= data.total) break;
  }

  const byNumber = new Map<string, Chapter>();
  for (const c of all) {
    const a = c.attributes;
    if (a.externalUrl || a.pages < 1) continue;
    const number = a.chapter ?? "0";
    if (byNumber.has(number)) continue; // first upload of each chapter wins
    byNumber.set(number, {
      id: c.id,
      number,
      title: a.title || null,
      pages: a.pages,
      group: c.relationships.find((r) => r.type === "scanlation_group")?.attributes?.name ?? null,
      publishedAt: a.publishAt,
    });
  }
  return [...byNumber.values()].sort((x, y) => parseFloat(x.number) - parseFloat(y.number));
}

/** Page image URLs for a chapter (full quality and data-saver). They stay valid for ~15 minutes. */
export async function getChapterPages(
  chapterId: string,
): Promise<{ pages: string[]; saver: string[]; number: string | null; group: string | null } | null> {
  const [res, info] = await Promise.all([
    fetch(`${API}/at-home/server/${chapterId}`, { headers: HEADERS, cache: "no-store" }).catch(() => null),
    get<{ data: MdChapter }>(`/chapter/${chapterId}`, [["includes[]", "scanlation_group"]], 3600),
  ]);
  if (!res?.ok) return null;
  const d = (await res.json()) as { baseUrl: string; chapter: { hash: string; data: string[]; dataSaver: string[] } };
  return {
    number: info?.data.attributes.chapter ?? null,
    group: info?.data.relationships.find((r) => r.type === "scanlation_group")?.attributes?.name ?? null,
    pages: d.chapter.data.map((f) => `${d.baseUrl}/data/${d.chapter.hash}/${f}`),
    saver: d.chapter.dataSaver.map((f) => `${d.baseUrl}/data-saver/${d.chapter.hash}/${f}`),
  };
}

export type LatestChapter = {
  /** AniList id of the manga (MangaDex's link), so it opens on this site. */
  anilistId: number;
  number: string;
  chapterId: string;
  /** ISO time the chapter came out. */
  at: string;
};

type MdFeedChapter = {
  id: string;
  attributes: { chapter: string | null; pages: number; externalUrl: string | null; readableAt: string };
  relationships: { type: string; attributes?: { links?: Record<string, string> | null } }[];
};

/** Newest English chapters on MangaDex, one per manga, for manga that are on AniList. */
export async function getLatestChapters(limit = 42): Promise<LatestChapter[]> {
  const data = await get<{ data: MdFeedChapter[] }>(
    "/chapter",
    [
      ["translatedLanguage[]", "en"],
      ["order[readableAt]", "desc"],
      ["includes[]", "manga"],
      ["limit", "100"],
      ...RATINGS.slice(0, 2).map((r): [string, string] => ["contentRating[]", r]),
    ],
    300,
  );
  const seen = new Set<number>();
  const out: LatestChapter[] = [];
  for (const c of data?.data ?? []) {
    if (c.attributes.externalUrl || c.attributes.pages < 1) continue;
    const al = Number(c.relationships.find((r) => r.type === "manga")?.attributes?.links?.al);
    if (!Number.isInteger(al) || al < 1 || seen.has(al)) continue;
    seen.add(al);
    out.push({ anilistId: al, number: c.attributes.chapter ?? "?", chapterId: c.id, at: c.attributes.readableAt });
    if (out.length >= limit) break;
  }
  return out;
}
