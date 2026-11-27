import type { Metadata } from "next";
import { ContinueReading, LatestChapters, TabbedShelf, type LatestItem } from "@/components/MangaHome";
import Row from "@/components/Row";
import AnimeCard from "@/components/AnimeCard";
import { getMangaHome, getMediaByIds } from "@/lib/anilist";
import { getLatestChapters, type LatestChapter } from "@/lib/manga/mangadex";
import { getLatestChapters as getMangaKatanaLatest } from "@/lib/manga/mangakatana";

export const metadata: Metadata = { title: "Manga" };
export const revalidate = 300;

export default async function MangaHomePage() {
  const [home, mangadex, mangakatana] = await Promise.all([
    getMangaHome(),
    getLatestChapters(63).catch(() => []),
    getMangaKatanaLatest().catch((e) => (console.error("[manga] mangakatana latest", e), [] as LatestChapter[])),
  ]);
  // Newest first, one entry per manga across both sources.
  const seen = new Set<number>();
  const latest = [...mangadex, ...mangakatana]
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
