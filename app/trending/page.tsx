import type { Metadata } from "next";
import Link from "next/link";
import YearPicker from "@/components/YearPicker";
import { airedEpisodes, currentSeason, formatLabel, getSeasonal, plainText, statusDot, titleOf } from "@/lib/anilist";

export const metadata: Metadata = { title: "Trending" };

const SEASONS = ["WINTER", "SPRING", "SUMMER", "FALL"];

type Props = { searchParams: Promise<{ season?: string; year?: string; page?: string }> };

export default async function TrendingPage({ searchParams }: Props) {
  const sp = await searchParams;
  const now = currentSeason();
  const season = SEASONS.includes(sp.season?.toUpperCase() ?? "") ? sp.season!.toUpperCase() : now.season;
  const year = Number(sp.year) >= 1960 && Number(sp.year) <= now.year + 2 ? Number(sp.year) : now.year;
  const page = Math.max(1, Number(sp.page) || 1);
  const data = await getSeasonal(season, year, page);
  const label = `${season[0]}${season.slice(1).toLowerCase()} ${year}`;
  const href = (p: { season?: string; year?: number; page?: number }) =>
    `/trending?season=${(p.season ?? season).toLowerCase()}&year=${p.year ?? year}${p.page && p.page > 1 ? `&page=${p.page}` : ""}`;

  return (
    <div className="container page trending">
      <div className="trending__head">
        <div>
          <h1>Trending</h1>
          <span className="muted">{label} · Trending</span>
        </div>
        <nav className="trending__seasons">
          {SEASONS.map((s) => (
            <Link key={s} href={href({ season: s, page: 1 })} className={s === season ? "is-active" : ""}>
              {s}
            </Link>
          ))}
        </nav>
        <YearPicker year={year} season={season} max={now.year + 1} />
      </div>

      {data.media.length === 0 ? (
        <p className="empty">Nothing listed for {label} yet.</p>
      ) : (
        <div className="tgrid">
          {data.media.map((m) => {
            const aired = airedEpisodes(m);
            return (
              <Link key={m.id} href={`/anime/${m.id}`} className="tcard">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.coverImage.large ?? undefined} alt="" loading="lazy" />
                <span className="tcard__body">
                  <span className="tcard__title">{titleOf(m.title)}</span>
                  <span className="chips">
                    <i className={`dot ${statusDot(m.status)}`} />
                    {aired || m.episodes ? (
                      <span>{m.status === "RELEASING" && m.episodes ? `${aired}/${m.episodes}` : aired || m.episodes} eps</span>
                    ) : null}
                    {m.format ? <span>{formatLabel(m)}</span> : null}
                    {m.seasonYear ? <span>{m.seasonYear}</span> : null}
                    {m.averageScore ? <span>★ {m.averageScore}</span> : null}
                  </span>
                  <span className="tcard__desc">{plainText(m.description)}</span>
                </span>
              </Link>
            );
          })}
        </div>
      )}

      {page > 1 || data.pageInfo.hasNextPage ? (
        <div className="pager">
          {page > 1 ? (
            <Link className="btn btn--sm" href={href({ page: page - 1 })}>
              ‹ Prev
            </Link>
          ) : null}
          <span>Page {page}</span>
          {data.pageInfo.hasNextPage ? (
            <Link className="btn btn--sm" href={href({ page: page + 1 })}>
              Next ›
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
