import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAnime, prettyEnum, titleOf, type MediaCard } from "@/lib/anilist";
import type { SideMedia } from "@/components/SideMediaList";
import { getEpisodeMeta } from "@/lib/extras";
import { episodesFor, toAnimeRef, withTimeout } from "@/lib/sources";
import WatchClient, { type Season } from "./WatchClient";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ep?: string; source?: string; audio?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const m = await getAnime(Number((await params).id));
  return m ? { title: `Watch ${titleOf(m.title)}` } : {};
}

export default async function WatchPage({ params, searchParams }: Props) {
  const id = Number((await params).id);
  const sp = await searchParams;
  if (!Number.isInteger(id)) notFound();
  const m = await getAnime(id);
  if (!m) notFound();

  const title = titleOf(m.title);
  // Episode titles/stills are nice to have: don't wait more than a few seconds for them.
  const [providers, meta] = await Promise.all([
    episodesFor(toAnimeRef(m)),
    withTimeout(getEpisodeMeta(m), 4000, "episode details").catch(() => ({})),
  ]);

  // Prequels and sequels, in release order, around this entry.
  const ordered = [
    ...m.relations.edges
      .filter((e) => e.node.type === "ANIME" && (e.relationType === "PREQUEL" || e.relationType === "SEQUEL"))
      .map((e) => ({
        id: e.node.id,
        title: titleOf(e.node.title),
        cover: e.node.bannerImage ?? e.node.coverImage.extraLarge,
        format: e.node.format,
        year: e.node.seasonYear ?? null,
        order: e.relationType === "PREQUEL" ? -1 : 1,
      })),
    { id: m.id, title, cover: m.bannerImage ?? m.coverImage.extraLarge, format: m.format, year: m.seasonYear ?? null, order: 0, current: true },
  ].sort((a, b) => a.order - b.order || (a.year ?? 0) - (b.year ?? 0));
  // "Season 1, Season 2…" for series; "Movie", "OVA"… for the rest.
  let seasonNo = 0;
  const seasons: Season[] = ordered.map(({ order: _o, format, ...s }) => ({
    ...s,
    label: format === "TV" || format === "TV_SHORT" || format === "ONA" ? `Season ${++seasonNo}` : prettyEnum(format) || "Special",
  }));

  const side = (n: MediaCard, relation?: string): SideMedia => ({
    id: n.id,
    title: titleOf(n.title),
    cover: n.coverImage.large,
    banner: n.bannerImage,
    format: n.format,
    status: n.status,
    year: n.seasonYear,
    episodes: n.episodes,
    score: n.averageScore,
    relation: relation ? prettyEnum(relation) : null,
  });
  const related = m.relations.edges
    .filter((e) => e.node.type === "ANIME" && e.relationType !== "PREQUEL" && e.relationType !== "SEQUEL")
    .map((e) => side(e.node, e.relationType));
  const recommendations = m.recommendations.nodes
    .map((n) => n.mediaRecommendation)
    .filter((r): r is MediaCard => !!r)
    .slice(0, 10)
    .map((r) => side(r));

  if (providers.length === 0) {
    return (
      <div className="container page">
        <h1 className="page__title">{title}</h1>
        <p className="empty">No episodes are available on this site for this title yet.</p>
        <p>
          <Link href={`/anime/${m.id}`}>← Back to details</Link>
        </p>
      </div>
    );
  }

  return (
    <WatchClient
      anime={{
        id: m.id,
        title,
        cover: m.coverImage.large,
        banner: m.bannerImage,
        format: m.format,
        episodes: m.episodes,
        season: m.season,
        seasonYear: m.seasonYear,
      }}
      related={related}
      recommendations={recommendations}
      providers={providers}
      meta={meta}
      seasons={seasons}
      initialAudio={sp.audio === "dub" ? "dub" : sp.audio === "sub" ? "sub" : null}
      initialEp={Number(sp.ep) || null}
      initialSource={sp.source ?? null}
    />
  );
}
