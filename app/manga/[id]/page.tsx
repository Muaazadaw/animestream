import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import AnimeCard from "@/components/AnimeCard";
import Characters from "@/components/Characters";
import { ChapterList, MangaActions, ReadMore } from "@/components/MangaDetail";
import Row from "@/components/Row";
import { getCharacters } from "@/lib/extras";
import { getManga, plainText, prettyEnum, titleOf, type MediaCard } from "@/lib/anilist";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const m = await getManga(Number((await params).id));
  return m ? { title: titleOf(m.title), description: plainText(m.description).slice(0, 160) } : {};
}

/** Staff names for the given roles ("Story", "Art", "Story & Art"). */
function staffFor(edges: { role: string; node: { name: { full: string } } }[], match: RegExp) {
  return [...new Set(edges.filter((e) => match.test(e.role)).map((e) => e.node.name.full))].join(", ") || null;
}

export default async function MangaPage({ params }: Props) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const m = await getManga(id);
  if (!m) notFound();

  const characters = await getCharacters(m.id).catch(() => []);
  const title = titleOf(m.title);
  const staff = m.staff?.edges ?? [];
  const author = staffFor(staff, /story/i);
  const art = staffFor(staff, /art/i);
  const alt = [m.title.english, m.title.romaji, m.title.native, ...(m.synonyms ?? [])].filter(
    (t, i, a): t is string => !!t && t !== title && a.indexOf(t) === i && !/[Ѐ-ӿ؀-ۿ]/.test(t),
  );
  const relations = m.relations.edges;
  const recs = m.recommendations.nodes.map((n) => n.mediaRecommendation).filter(Boolean) as MediaCard[];
  const format = m.format === "MANGA" && m.countryOfOrigin === "KR" ? "Manhwa" : m.format === "MANGA" && m.countryOfOrigin === "CN" ? "Manhua" : prettyEnum(m.format);

  const facts: [string, string | number | null][] = [
    ["Type", format],
    ["Status", prettyEnum(m.status)],
    ["Published", m.startDate.year ? String(m.startDate.year) : null],
    ["Chapters", m.chapters ?? (m.status === "RELEASING" ? "Ongoing" : null)],
    ["Volumes", m.volumes ?? null],
    ["Author", author],
    ["Art", art && art !== author ? art : null],
    ["Score", m.averageScore ? `${m.averageScore}%` : null],
    ["Popularity", m.popularity?.toLocaleString() ?? null],
  ];

  return (
    <div className="detail manga-detail">
      <div
        className="detail__banner"
        style={{
          backgroundImage: m.bannerImage ? `url(${m.bannerImage})` : `url(${m.coverImage.extraLarge ?? m.coverImage.large})`,
          backgroundColor: m.coverImage.color ?? undefined,
        }}
        data-blur={m.bannerImage ? undefined : ""}
      />
      <div className="container detail__main">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="detail__cover" src={m.coverImage.extraLarge ?? m.coverImage.large ?? undefined} alt={title} />
        <div className="detail__info">
          <div className="hero__chips mchips">
            <span>{format || "Manga"}</span>
            {m.status ? <span>{prettyEnum(m.status)}</span> : null}
            {m.startDate.year ? <span>{m.startDate.year}</span> : null}
            {m.averageScore ? <span className="mchips__score">★ {(m.averageScore / 10).toFixed(1)}</span> : null}
          </div>
          <h1>{title}</h1>
          {alt.length ? <div className="detail__native">{alt.slice(0, 4).join(" · ")}</div> : null}
          <MangaActions
            manga={{ id: m.id, title, cover: m.coverImage.large, format: m.format, type: "MANGA", chapters: m.chapters ?? null }}
          />
          <div className="hero__genres">
            {m.genres.map((g) => (
              <Link key={g} className="chip" href={`/search?type=manga&genres=${encodeURIComponent(g)}`}>
                {g}
              </Link>
            ))}
          </div>
          <ReadMore text={plainText(m.description)} />
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
        <ChapterList mangaId={m.id} />

        {characters.length > 0 ? <Characters characters={characters} /> : null}

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
