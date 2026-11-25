import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import WhereToWatch from "@/components/WhereToWatch";
import { getAnime, titleOf } from "@/lib/anilist";
import { episodesFor, toAnimeRef } from "@/lib/sources";
import WatchClient from "./WatchClient";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ep?: string; source?: string }>;
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
  const providers = await episodesFor(toAnimeRef(m));

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
      initialEp={Number(sp.ep) || null}
      initialSource={sp.source ?? null}
    />
  );
}
