import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAnime, prettyEnum, titleOf } from "@/lib/anilist";
import type { Season } from "./WatchClient";
import WatchLoader from "./WatchLoader";

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
  const ep = Number(sp.ep) || 1;
  // AniList's own still for this episode ("Episode 3 - Title"), if it has one.
  const still = m.streamingEpisodes
    .map((s) => ({ s, match: /^Episode\s+(\d+)\s*[-:]\s*(.+)$/i.exec(s.title) }))
    .find((x) => x.match && Number(x.match[1]) === ep);

  // Prequels and sequels, in release order, around this entry.
  const seasons: Season[] = [
    ...m.relations.edges
      .filter((e) => e.node.type === "ANIME" && (e.relationType === "PREQUEL" || e.relationType === "SEQUEL"))
      .map((e) => ({
        id: e.node.id,
        title: titleOf(e.node.title),
        cover: e.node.bannerImage ?? e.node.coverImage.extraLarge,
        label: `${prettyEnum(e.relationType)} · ${prettyEnum(e.node.format)}`,
        year: e.node.seasonYear ?? 0,
        order: e.relationType === "PREQUEL" ? -1 : 1,
      })),
    {
      id: m.id,
      title,
      cover: m.bannerImage ?? m.coverImage.extraLarge,
      label: `Now watching · ${prettyEnum(m.format)}`,
      year: m.seasonYear ?? 0,
      order: 0,
      current: true,
    },
  ]
    .sort((a, b) => a.order - b.order || a.year - b.year)
    .map(({ year: _y, order: _o, ...s }) => s);

  return (
    <WatchLoader
      anime={{
        id: m.id,
        title,
        cover: m.coverImage.large,
        banner: m.bannerImage,
        format: m.format,
        episodes: m.episodes,
      }}
      seasons={seasons}
      externalLinks={m.externalLinks}
      poster={still?.s.thumbnail ?? m.bannerImage ?? m.coverImage.extraLarge}
      posterTitle={still?.match?.[2] ?? null}
      initialAudio={sp.audio === "dub" ? "dub" : sp.audio === "sub" ? "sub" : null}
      initialEp={Number(sp.ep) || null}
      initialSource={sp.source ?? null}
    />
  );
}
