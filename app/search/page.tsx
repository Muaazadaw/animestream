import type { Metadata } from "next";
import Link from "next/link";
import AnimeCard from "@/components/AnimeCard";
import { FORMATS, GENRES, prettyEnum, searchAnime } from "@/lib/anilist";

export const metadata: Metadata = { title: "Browse" };

type Props = { searchParams: Promise<Record<string, string | undefined>> };

const SORTS: [string, string][] = [
  ["", "Best match / Popular"],
  ["TRENDING_DESC", "Trending"],
  ["POPULARITY_DESC", "Popularity"],
  ["SCORE_DESC", "Score"],
  ["START_DATE_DESC", "Newest"],
  ["TITLE_ROMAJI", "Title A–Z"],
];

const STATUSES = ["RELEASING", "FINISHED", "NOT_YET_RELEASED"];

export default async function SearchPage({ searchParams }: Props) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const result = await searchAnime({
    search: sp.q,
    genre: sp.genre,
    format: sp.format,
    status: sp.status,
    sort: sp.sort,
    page,
  });

  const pageHref = (p: number) => {
    const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
    qs.set("page", String(p));
    return `/search?${qs}`;
  };

  return (
    <div className="container page">
      <h1 className="page__title">{sp.q ? `Results for “${sp.q}”` : "Browse anime"}</h1>

      <form className="filters" action="/search">
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Title…" />
        <select name="genre" defaultValue={sp.genre ?? ""}>
          <option value="">Any genre</option>
          {GENRES.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
        <select name="format" defaultValue={sp.format ?? ""}>
          <option value="">Any format</option>
          {FORMATS.map((f) => (
            <option key={f} value={f}>
              {prettyEnum(f)}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={sp.status ?? ""}>
          <option value="">Any status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {prettyEnum(s)}
            </option>
          ))}
        </select>
        <select name="sort" defaultValue={sp.sort ?? ""}>
          {SORTS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <button className="btn btn--primary" type="submit">
          Filter
        </button>
      </form>

      {result.media.length === 0 ? (
        <p className="empty">No anime matched those filters.</p>
      ) : (
        <div className="grid">
          {result.media.map((m) => (
            <AnimeCard key={m.id} anime={m} />
          ))}
        </div>
      )}

      <div className="pager">
        {page > 1 ? (
          <Link className="btn" href={pageHref(page - 1)}>
            ‹ Previous
          </Link>
        ) : null}
        <span>Page {page}</span>
        {result.pageInfo.hasNextPage ? (
          <Link className="btn" href={pageHref(page + 1)}>
            Next ›
          </Link>
        ) : null}
      </div>
    </div>
  );
}
