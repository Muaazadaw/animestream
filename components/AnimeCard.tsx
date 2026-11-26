import Link from "next/link";
import { prettyEnum, titleOf, type MediaCard } from "@/lib/anilist";

export default function AnimeCard({ anime, badge }: { anime: MediaCard; badge?: string }) {
  const title = titleOf(anime.title);
  const eps = anime.nextAiringEpisode ? anime.nextAiringEpisode.episode - 1 : anime.episodes;
  return (
    <Link href={`/anime/${anime.id}`} className="card" title={title}>
      <div className="card__img" style={{ background: anime.coverImage.color ?? "#1c1c26" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={anime.coverImage.extraLarge ?? anime.coverImage.large ?? undefined} alt="" loading="lazy" />
        {anime.averageScore ? <span className="card__score">★ {(anime.averageScore / 10).toFixed(1)}</span> : null}
        {badge ? <span className="card__badge">{badge}</span> : null}
        <span className="card__play" aria-hidden>
          <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
      </div>
      <div className="card__title">{title}</div>
      <div className="card__meta">
        {[prettyEnum(anime.format), eps ? `${eps} eps` : null, anime.seasonYear].filter(Boolean).join(" · ")}
      </div>
    </Link>
  );
}
