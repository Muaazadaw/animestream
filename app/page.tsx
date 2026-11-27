import AnimeCard from "@/components/AnimeCard";
import ContinueWatching from "@/components/ContinueWatching";
import Hero, { type HeroItem } from "@/components/Hero";
import LatestEpisodes from "@/components/LatestEpisodes";
import Row from "@/components/Row";
import SideList from "@/components/SideList";
import { airedEpisodes, getHome, plainText, titleOf } from "@/lib/anilist";
import { getHeroArt } from "@/lib/extras";

export const revalidate = 900;

export default async function HomePage() {
  const home = await getHome();

  const candidates = home.trending.slice(0, 16);
  const art = await Promise.all(candidates.map((m) => getHeroArt(m.id).catch(() => ({ backdrop: null, logo: null }))));
  // Prefer TVDB's backdrop; fall back to AniList's banner; skip shows with neither.
  const picks = candidates
    .map((m, i) => ({ m, art: art[i], banner: art[i].backdrop ?? m.bannerImage }))
    .filter((p) => p.banner)
    .slice(0, 10);
  const hero: HeroItem[] = picks.map(({ m, art, banner }) => {
    const eps = m.episodes ?? airedEpisodes(m);
    return {
      id: m.id,
      title: titleOf(m.title),
      banner: banner!,
      logo: art.logo,
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
