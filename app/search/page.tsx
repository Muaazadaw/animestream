import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Menu";
import SearchFilters from "@/components/SearchFilters";
import {
  airedEpisodes,
  COUNTRIES,
  currentSeason,
  FORMATS,
  GENRES,
  MANGA_FORMATS,
  getTags,
  mediaHref,
  formatLabel,
  prettyEnum,
  searchAnime,
  SEARCH_FILTER_KEYS,
  searchPeople,
  SOURCES,
  statusDot,
  titleOf,
} from "@/lib/anilist";

export const metadata: Metadata = { title: "Search" };

type Props = { searchParams: Promise<Record<string, string | undefined>> };

const SORTS: [string, string][] = [
  ["POPULARITY_DESC", "Most popular"],
  ["TRENDING_DESC", "Trending"],
  ["SCORE_DESC", "Highest rated"],
  ["START_DATE_DESC", "Newest"],
  ["START_DATE", "Oldest"],
  ["FAVOURITES_DESC", "Most favourited"],
  ["TITLE_ROMAJI", "Title A–Z"],
];
const STATUSES = ["RELEASING", "FINISHED", "NOT_YET_RELEASED", "HIATUS", "CANCELLED"];
const SEASONS = ["WINTER", "SPRING", "SUMMER", "FALL"];
const TYPES = [
  { id: "anime", label: "Anime", icon: "grid" },
  { id: "manga", label: "Manga", icon: "library" },
  { id: "staff", label: "Staff", icon: "user" },
  { id: "characters", label: "Characters", icon: "user" },
] as const;

const opt = (values: string[]) => values.map((v) => ({ value: v, label: prettyEnum(v) }));
const csv = (v?: string) => (v ? v.split(",").filter(Boolean) : []);

export default async function SearchPage({ searchParams }: Props) {
  const sp = await searchParams;
  // Older links used ?genre= / ?format=.
  if (sp.genre && !sp.genres) sp.genres = sp.genre;
  if (sp.format && !sp.formats) sp.formats = sp.format;
  delete sp.genre;
  delete sp.format;

  const type = sp.type === "staff" || sp.type === "characters" || sp.type === "manga" ? sp.type : "anime";
  const media = type === "anime" || type === "manga";
  const manga = type === "manga";
  const page = Math.max(1, Number(sp.page) || 1);
  const pageHref = (p: number) => {
    const qs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "page") as [string, string][]);
    if (p > 1) qs.set("page", String(p));
    return `/search${qs.size ? `?${qs}` : ""}`;
  };
  const typeHref = (t: string) => {
    const qs = new URLSearchParams();
    if (sp.q) qs.set("q", sp.q);
    if (t !== "anime") qs.set("type", t);
    return `/search${qs.size ? `?${qs}` : ""}`;
  };

  const [anime, people, tags] = await Promise.all([
    media
      ? searchAnime({
          type: manga ? "MANGA" : "ANIME",
          search: sp.q,
          genres: csv(sp.genres),
          tags: csv(sp.tags),
          formats: csv(sp.formats),
          status: sp.status,
          year: Number(sp.year) || undefined,
          season: manga ? undefined : sp.season,
          source: sp.source,
          country: sp.country,
          minScore: Number(sp.score) || undefined,
          sort: sp.sort,
          page,
        })
      : null,
    !media ? searchPeople(type as "staff" | "characters", sp.q, page) : null,
    media ? getTags().catch(() => []) : [],
  ]);
  const hasNext = (anime ?? people)?.pageInfo.hasNextPage ?? false;
  const empty = media ? anime?.media.length === 0 : people?.people.length === 0;
  const thisYear = currentSeason().year;

  const pager = (
    <div className="spager">
      {page > 1 ? (
        <Link className="spager__btn" href={pageHref(page - 1)} aria-label="Previous page">
          <Icon name="prev" size={14} />
        </Link>
      ) : (
        <span className="spager__btn is-disabled">
          <Icon name="prev" size={14} />
        </span>
      )}
      {hasNext ? (
        <Link className="spager__btn" href={pageHref(page + 1)} aria-label="Next page">
          <Icon name="next" size={14} />
        </Link>
      ) : (
        <span className="spager__btn is-disabled">
          <Icon name="next" size={14} />
        </span>
      )}
    </div>
  );

  return (
    <div className="container page search-page">
      <div className="search-page__head">
        <div>
          {manga && sp.sort === "TRENDING_DESC" && !sp.q ? (
            <>
              <h1>Trending manga</h1>
              <p>What people are reading right now.</p>
            </>
          ) : (
            <>
              <h1>Search</h1>
              <p>Simple when you want it, extremely specific when you need it.</p>
            </>
          )}
        </div>
        <nav className="search-page__types">
          {TYPES.map((t) => (
            <Link key={t.id} href={typeHref(t.id)} className={type === t.id ? "is-active" : ""}>
              <Icon name={t.icon} size={14} /> {t.label}
            </Link>
          ))}
        </nav>
      </div>

      {sp.q ? (
        <div className="search-page__query">
          Results for <strong>“{sp.q}”</strong>
          <Link href={(() => {
            const qs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "q" && k !== "page") as [string, string][]);
            return `/search${qs.size ? `?${qs}` : ""}`;
          })()} aria-label="Clear search">
            <Icon name="close" size={13} />
          </Link>
        </div>
      ) : null}

      {media ? (
        <SearchFilters
          key={SEARCH_FILTER_KEYS.map((k) => sp[k] ?? "").join("|")}
          values={Object.fromEntries(Object.entries(sp).filter(([, v]) => v)) as Record<string, string>}
          genres={GENRES.map((g) => ({ value: g, label: g }))}
          tags={tags.map((t) => ({ value: t.name, label: t.name, group: t.category.split("-")[0] }))}
          formats={opt(manga ? MANGA_FORMATS : FORMATS)}
          statuses={opt(STATUSES)}
          sorts={SORTS.map(([value, label]) => ({ value, label }))}
          sources={opt(SOURCES)}
          countries={COUNTRIES.map(([value, label]) => ({ value, label }))}
          seasons={manga ? [] : opt(SEASONS)}
          years={Array.from({ length: thisYear + 2 - 1960 }, (_, i) => String(thisYear + 1 - i)).map((y) => ({ value: y, label: y }))}
        />
      ) : null}

      <div className="search-page__bar">
        <span className="muted">Page {page}</span>
        {pager}
      </div>

      {empty ? (
        <p className="empty">Nothing matched. Try fewer filters.</p>
      ) : media ? (
        <div className="latest__grid">
          {anime!.media.map((m) => {
            const eps = manga ? m.chapters : (m.episodes ?? airedEpisodes(m));
            return (
              <Link key={m.id} href={mediaHref(m)} className="pcard">
                <span className="pcard__img">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.coverImage.large ?? undefined} alt="" loading="lazy" />
                  {m.averageScore ? <span className="pcard__score">★ {(m.averageScore / 10).toFixed(1)}</span> : null}
                </span>
                <span className="chips">
                  {eps ? (
                    <span>
                      {manga ? "" : <Icon name="cc" size={11} />} {eps}
                      {manga ? " ch" : ""}
                    </span>
                  ) : null}
                  {m.format ? <span>{formatLabel(m)}</span> : null}
                  {m.seasonYear ? <span>{m.seasonYear}</span> : null}
                </span>
                <span className="pcard__title">
                  <i className={`dot ${statusDot(m.status)}`} />
                  {titleOf(m.title)}
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="latest__grid">
          {people!.people.map((p) => (
            <a
              key={p.id}
              href={`https://anilist.co/${type === "characters" ? "character" : "staff"}/${p.id}`}
              target="_blank"
              rel="noreferrer"
              className="pcard"
            >
              <span className="pcard__img">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.image ?? undefined} alt="" loading="lazy" />
                <span className="pcard__score">♥ {p.favourites.toLocaleString()}</span>
              </span>
              <span className="pcard__title">{p.name}</span>
              {p.sub ? <span className="pcard__sub">{p.sub}</span> : null}
            </a>
          ))}
        </div>
      )}

      {page > 1 || hasNext ? (
        <div className="pager">
          {page > 1 ? (
            <Link className="btn btn--sm" href={pageHref(page - 1)}>
              <Icon name="prev" size={14} /> Prev
            </Link>
          ) : (
            <span className="btn btn--sm btn--disabled">
              <Icon name="prev" size={14} /> Prev
            </span>
          )}
          {hasNext ? (
            <Link className="btn btn--sm" href={pageHref(page + 1)}>
              Next <Icon name="next" size={14} />
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
