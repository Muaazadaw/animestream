import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import AnimeCard from "@/components/AnimeCard";
import Artwork from "@/components/Artwork";
import Characters from "@/components/Characters";
import Countdown from "@/components/Countdown";
import Row from "@/components/Row";
import Trailer from "@/components/Trailer";
import WatchlistButton from "@/components/WatchlistButton";
import WhereToWatch from "@/components/WhereToWatch";
import { getArtwork, getCharacters, getEpisodeMeta } from "@/lib/extras";
import { airedEpisodes, getAnime, plainText, prettyEnum, titleOf, type MediaCard } from "@/lib/anilist";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const m = await getAnime(Number((await params).id));
  return m ? { title: titleOf(m.title), description: plainText(m.description).slice(0, 160) } : {};
}

export default async function AnimePage({ params }: Props) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const m = await getAnime(id);
  if (!m) notFound();

  const [characters, artwork] = await Promise.all([
    getCharacters(m.id),
    getEpisodeMeta(m).then((eps) => getArtwork(m, eps)),
  ]);
  const title = titleOf(m.title);
  const aired = airedEpisodes(m);
  const relations = m.relations.edges.filter((e) => e.node.type === "ANIME");
  const recs = m.recommendations.nodes.map((n) => n.mediaRecommendation).filter(Boolean) as MediaCard[];
  const start = m.startDate.year
    ? new Date(m.startDate.year, (m.startDate.month ?? 1) - 1, m.startDate.day ?? 1).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: m.startDate.day ? "numeric" : undefined,
      })
    : null;

  const facts: [string, string | number | null][] = [
    ["Format", prettyEnum(m.format)],
    ["Episodes", m.episodes ?? (aired ? `${aired}+` : "?")],
    ["Duration", m.duration ? `${m.duration} min` : null],
    ["Status", prettyEnum(m.status)],
    ["Season", m.season ? `${prettyEnum(m.season)} ${m.seasonYear ?? ""}` : null],
    ["Aired", start],
    ["Studio", m.studios.nodes.map((s) => s.name).join(", ") || null],
    ["Source", prettyEnum(m.source)],
    ["Score", m.averageScore ? `${m.averageScore}%` : null],
    ["Popularity", m.popularity?.toLocaleString() ?? null],
  ];

  return (
    <div className="detail">
      <div
        className="detail__banner"
        style={{
          backgroundImage: m.bannerImage ? `url(${m.bannerImage})` : undefined,
          backgroundColor: m.coverImage.color ?? undefined,
        }}
      />
      <div className="container detail__main">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="detail__cover" src={m.coverImage.extraLarge ?? m.coverImage.large ?? undefined} alt={title} />
        <div className="detail__info">
          <h1>{title}</h1>
          {m.title.native ? <div className="detail__native">{m.title.native}</div> : null}
          <div className="hero__genres">
            {m.genres.map((g) => (
              <Link key={g} className="chip" href={`/search?genre=${encodeURIComponent(g)}`}>
                {g}
              </Link>
            ))}
          </div>
          {m.nextAiringEpisode ? (
            <div className="airing">
              Episode {m.nextAiringEpisode.episode} airs in <Countdown at={m.nextAiringEpisode.airingAt} />
            </div>
          ) : null}
          <div className="hero__actions">
            {aired > 0 ? (
              <Link href={`/watch/${m.id}`} className="btn btn--primary">
                ▶ Watch now
              </Link>
            ) : (
              <span className="btn btn--disabled">Not yet aired</span>
            )}
            <WatchlistButton
              anime={{ id: m.id, title, cover: m.coverImage.large, format: m.format, episodes: m.episodes }}
            />
          </div>
          <p className="detail__desc">{plainText(m.description)}</p>
          <WhereToWatch links={m.externalLinks} />
        </div>
        <aside className="facts">
          {facts
            .filter(([, v]) => v !== null && v !== "")
            .map(([k, v]) => (
              <div key={k}>
                <span>{k}</span>
                <strong>{v}</strong>
              </div>
            ))}
        </aside>
      </div>

      <div className="container">
        {m.trailer?.site === "youtube" ? <Trailer youtubeId={m.trailer.id} title={title} /> : null}

        {characters.length > 0 ? <Characters characters={characters} /> : null}

        <Artwork images={artwork} />

        {relations.length > 0 ? (
          <Row title="Related">
            {relations.map((r) => (
              <AnimeCard key={r.node.id} anime={r.node} badge={prettyEnum(r.relationType)} />
            ))}
          </Row>
        ) : null}

        {recs.length > 0 ? (
          <Row title="More like this">
            {recs.map((r) => (
              <AnimeCard key={r.id} anime={r} />
            ))}
          </Row>
        ) : null}
      </div>
    </div>
  );
}
