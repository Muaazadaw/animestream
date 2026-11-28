import AnimeCard from "@/components/AnimeCard";
import ContinueWatching from "@/components/ContinueWatching";
import Hero, { type HeroItem } from "@/components/Hero";
import LatestEpisodes from "@/components/LatestEpisodes";
import Row from "@/components/Row";
import SideList from "@/components/SideList";
import { airedEpisodes, getHome, plainText, titleOf } from "@/lib/anilist";
import { getHeroArt, imageSize } from "@/lib/extras";

export const revalidate = 900;

export default async function HomePage() {
  const home = await getHome();

  const candidates = home.trending.slice(0, 20);
  const art = await Promise.all(candidates.map((m) => getHeroArt(m.id, !!m.title.english).catch(() => ({ backdrop: null, logo: null }))));
  // For each show, measure both AniList's banner and TVDB's backdrop and keep whichever needs the
  // least upscaling to cover a typical 1920×690 hero. Sharp slides come first, in trending order.
  const scored = await Promise.all(
    candidates.map(async (m, i) => {
      const options = [m.bannerImage, art[i].backdrop].filter((u): u is string => !!u);
      const sizes = await Promise.all(options.map(imageSize));
      let best: { banner: string; stretch: number } | null = null;
      options.forEach((url, k) => {
        const s = sizes[k];
        const stretch = s ? Math.max(1920 / s.w, 690 / s.h) : 9;
        if (!best || stretch < best.stretch) best = { banner: url, stretch };
      });
      return best ? { m, art: art[i], ...(best as { banner: string; stretch: number }) } : null;
    }),
  );
  const usable = scored.filter((p) => p !== null);
  const sharp = usable.filter((p) => p.stretch <= 1.15);
  const soft = usable.filter((p) => p.stretch > 1.15).sort((a, b) => a.stretch - b.stretch);
  const picks = [...sharp, ...soft].slice(0, 10);
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
