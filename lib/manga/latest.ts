// Latest chapters from the scraped sources, matched to AniList by exact title. Server only.

import { searchMangaTitle } from "../anilist";
import type { LatestChapter } from "./mangadex";
import { norm } from "./text";

/** A new chapter as a source lists it: the manga's names (main title first). */
export type LatestItem = { names: string[]; chapterId: string; number: string; at: string };

// Main title → AniList id (null: no exact match), remembered for this server's life.
const matched = new Map<string, number | null>();
// New AniList lookups allowed per call, shared by every source. AniList allows 30 a minute
// across the whole site, so a cold cache fills in over a few page loads instead of all at once.
const LOOKUPS_PER_CALL = 10;

/** Newest first, one per manga, for items whose manga has an AniList entry with one of the same names. */
export async function matchLatest(items: LatestItem[]): Promise<LatestChapter[]> {
  const sorted = [...items].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  // Unknown titles are looked up one at a time, newest first, until the budget runs out
  // or AniList refuses; the rest wait for a later call.
  let budget = LOOKUPS_PER_CALL;
  const seen = new Set<number>();
  const out: LatestChapter[] = [];
  for (const item of sorted) {
    const key = item.names[0];
    if (!matched.has(key)) {
      if (budget-- <= 0) continue;
      const hits = await searchMangaTitle(key).catch(() => null);
      if (!hits) {
        budget = 0;
        continue;
      }
      const want = new Set(item.names.map(norm));
      matched.set(key, hits.find((m) => m.names.some((n) => want.has(norm(n))))?.id ?? null);
    }
    const id = matched.get(key);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ anilistId: id, number: item.number, chapterId: item.chapterId, at: item.at });
  }
  return out;
}
