import AnimeCard from "@/components/AnimeCard";
import ContinueWatching from "@/components/ContinueWatching";
import Hero, { type HeroItem } from "@/components/Hero";
import LatestEpisodes from "@/components/LatestEpisodes";
import Row from "@/components/Row";
import SideList from "@/components/SideList";
import { airedEpisodes, getHome, plainText, titleOf } from "@/lib/anilist";
import { getClearLogo } from "@/lib/extras";

export const revalidate = 900;

export default async function HomePage() {
  const home = await getHome();

  const picks = home.trending.filter((m) => m.bannerImage).slice(0, 10);
  const logos = await Promise.all(picks.map((m) => getClearLogo(m.id).catch(() => null)));
  const hero: HeroItem[] = picks.map((m, i) => {
    const eps = m.episodes ?? airedEpisodes(m);
    return {
      id: m.id,
      title: titleOf(m.title),
      banner: m.bannerImage!,
      logo: logos[i],
      cover: m.coverImage.large,
      format: m.format,
      episodes: m.episodes,
      description: plainText(m.description).slice(0, 300),
      chips: [eps ? `${eps} Episodes` : null, m.seasonYear ? String(m.seasonYear) : null, ...m.genres.slice(0, 3)].filter(
        Boolean,
      ) as string[],
      color: m.coverImage.color,
    };
  });

  return (
    <>
      <Hero items={hero} />
      <div className="container home">
        <ContinueWatching />

        <LatestEpisodes items={home.latest} />
        <div className="home__lists">
          <SideList title="Top Airing" items={home.topAiring} />
          <SideList title="Upcoming" items={home.upcomingSoon} upcoming />
        </div>

        <Row title={`Popular this season · ${home.seasonLabel}`} href="/trending">
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
        <Row title="Top Rated" href="/search?sort=SCORE_DESC">
          {home.top.map((m, i) => (
            <AnimeCard key={m.id} anime={m} badge={`#${i + 1}`} />
          ))}
        </Row>
      </div>
    </>
  );
}
