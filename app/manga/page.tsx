import type { Metadata } from "next";
import { ContinueReading, LatestChapters, TabbedShelf, type LatestItem } from "@/components/MangaHome";
import Row from "@/components/Row";
import AnimeCard from "@/components/AnimeCard";
import { getMangaHome, getMediaByIds } from "@/lib/anilist";
import { getLatestChapters, type LatestChapter } from "@/lib/manga/mangadex";
import { getLatestItems as getAsuraLatest } from "@/lib/manga/asura";
import { matchLatest, type LatestItem as ScrapedItem } from "@/lib/manga/latest";
import { getLatestItems as getMangaKatanaLatest } from "@/lib/manga/mangakatana";
import { getLatestItems as getMangaPillLatest } from "@/lib/manga/mangapill";

// A scraped source that fails or is blocked just adds nothing.
const scraped = (name: string, p: Promise<ScrapedItem[]>) =>
  p.catch((e) => (console.error(`[manga] ${name} latest`, e), [] as ScrapedItem[]));

export const metadata: Metadata = { title: "Manga" };
export const revalidate = 300;

export default async function MangaHomePage() {
  const [home, mangadex, scrapedItems] = await Promise.all([
    getMangaHome(),
    getLatestChapters(63).catch(() => [] as LatestChapter[]),
    Promise.all([
      scraped("asura", getAsuraLatest()),
      scraped("mangakatana", getMangaKatanaLatest()),
      scraped("mangapill", getMangaPillLatest()),
    ]).then((lists) => matchLatest(lists.flat())),
  ]);
  // Newest first, one entry per manga across every source.
  const seen = new Set<number>();
  const latest = [...mangadex, ...scrapedItems]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .filter((l) => !seen.has(l.anilistId) && !!seen.add(l.anilistId));
  const cards = await getMediaByIds(latest.map((l) => l.anilistId)).catch(() => []);
  const byId = new Map(cards.map((c) => [c.id, c]));
  const latestItems: LatestItem[] = latest
    .map((l) => ({ manga: byId.get(l.anilistId)!, number: l.number, chapterId: l.chapterId, at: l.at }))
    .filter((l) => l.manga);

  return (
    <div className="container page manga-home">
      <ContinueReading />
      <TabbedShelf
        tabs={[
          { id: "trending", label: "Trending", items: home.trending },
          { id: "popular", label: "Popular", items: home.popular },
          { id: "top", label: "Top rated", items: home.top },
          { id: "manhwa", label: "Manhwa", items: home.manhwa },
        ]}
      />
      <LatestChapters items={latestItems} />
      <Row title="Publishing now" href="/search?type=manga&status=RELEASING">
        {home.releasing.map((m) => (
          <AnimeCard key={m.id} anime={m} />
        ))}
      </Row>
    </div>
  );
}
