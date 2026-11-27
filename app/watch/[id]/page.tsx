import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import WhereToWatch from "@/components/WhereToWatch";
import { getAnime, prettyEnum, titleOf } from "@/lib/anilist";
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

  if (providers.length === 0) {
    return (
      <div className="container page">
        <h1 className="page__title">{title}</h1>
        <p className="empty">No episodes are available on this site for this title yet.</p>
        <WhereToWatch links={m.externalLinks} />
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
      }}
      providers={providers}
      meta={meta}
      seasons={seasons}
      initialAudio={sp.audio === "dub" ? "dub" : sp.audio === "sub" ? "sub" : null}
      initialEp={Number(sp.ep) || null}
      initialSource={sp.source ?? null}
    />
  );
}
