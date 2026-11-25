import AnimeCard from "@/components/AnimeCard";
import ContinueWatching from "@/components/ContinueWatching";
import Hero, { type HeroItem } from "@/components/Hero";
import Row from "@/components/Row";
import { getHome, plainText, prettyEnum, titleOf } from "@/lib/anilist";

export const revalidate = 1800;

export default async function HomePage() {
  const home = await getHome();

  const hero: HeroItem[] = home.trending
    .filter((m) => m.bannerImage)
    .slice(0, 8)
    .map((m) => ({
      id: m.id,
      title: titleOf(m.title),
      banner: m.bannerImage!,
      description: plainText(m.description).slice(0, 320),
      meta: [
        prettyEnum(m.format),
        m.episodes ? `${m.episodes} eps` : null,
        m.averageScore ? `★ ${(m.averageScore / 10).toFixed(1)}` : null,
        m.seasonYear ? String(m.seasonYear) : null,
      ].filter(Boolean) as string[],
      genres: m.genres,
      color: m.coverImage.color,
    }));

  return (
    <>
      <Hero items={hero} />
      <div className="container">
        <ContinueWatching />
        <Row title="Trending Now" href="/search?sort=TRENDING_DESC">
          {home.trending.map((m) => (
            <AnimeCard key={m.id} anime={m} />
          ))}
        </Row>
        <Row title={`Popular this season · ${home.seasonLabel}`}>
          {home.season.map((m) => (
            <AnimeCard
              key={m.id}
              anime={m}
              badge={m.nextAiringEpisode ? `EP ${m.nextAiringEpisode.episode - 1}` : undefined}
            />
          ))}
        </Row>
        <Row title="Upcoming next season" href="/search?status=NOT_YET_RELEASED">
          {home.upcoming.map((m) => (
            <AnimeCard key={m.id} anime={m} badge="Soon" />
          ))}
        </Row>
        <Row title="All-time Popular" href="/search?sort=POPULARITY_DESC">
          {home.popular.map((m) => (
            <AnimeCard key={m.id} anime={m} />
          ))}
        </Row>
        <Row title="Top Rated" href="/search?sort=SCORE_DESC">
          {home.top.map((m, i) => (
            <AnimeCard key={m.id} anime={m} badge={`#${i + 1}`} />
          ))}
        </Row>
      </div>
    </>
  );
}
