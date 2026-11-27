"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Menu";
import WhereToWatch from "@/components/WhereToWatch";
import type { ExternalLink } from "@/lib/anilist";
import type { EpisodeMeta } from "@/lib/extras";
import type { ProviderEpisodes } from "@/lib/sources";
import type { Audio, SavedAnime } from "@/lib/storage";
import WatchClient, { type Season } from "./WatchClient";

type Props = {
  anime: SavedAnime & { banner: string | null };
  seasons: Season[];
  externalLinks: ExternalLink[];
  /** Episode still (or banner) for the episode being opened, shown before anything else loads. */
  poster: string | null;
  posterTitle: string | null;
  initialEp: number | null;
  initialSource: string | null;
  initialAudio: Audio | null;
};

type Loaded = { providers: ProviderEpisodes[]; meta: Record<number, EpisodeMeta>; incomplete?: boolean };

const RETRY_MS = 8000;

/**
 * Renders the watch page immediately (poster, title, layout) and loads every
 * server's episode list in the background, so a slow server never shows up as
 * a blank page.
 */
export default function WatchLoader(props: Props) {
  const { anime } = props;
  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setFailed(false);
    fetch(`/api/episodes?id=${anime.id}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<Loaded>) : Promise.reject(new Error(String(r.status)))))
      .then(setData)
      .catch((e: Error) => e.name !== "AbortError" && setFailed(true));
    return () => ctrl.abort();
  }, [anime.id, attempt]);

  // A server that was still waking up gets one more chance; anything new is added.
  useEffect(() => {
    if (!data?.incomplete) return;
    const t = setTimeout(() => {
      fetch(`/api/episodes?id=${anime.id}`)
        .then((r) => (r.ok ? (r.json() as Promise<Loaded>) : null))
        .then((more) => {
          if (!more) return;
          setData((cur) => {
            if (!cur) return more;
            const have = new Set(cur.providers.map((p) => p.id));
            const added = more.providers.filter((p) => !have.has(p.id));
            return added.length || Object.keys(cur.meta).length < Object.keys(more.meta).length
              ? { providers: [...cur.providers, ...added], meta: { ...more.meta, ...cur.meta }, incomplete: false }
              : { ...cur, incomplete: false };
          });
        })
        .catch(() => {});
    }, RETRY_MS);
    return () => clearTimeout(t);
  }, [data?.incomplete, anime.id]);

  if (data && data.providers.length > 0) {
    return (
      <WatchClient
        anime={anime}
        providers={data.providers}
        meta={data.meta}
        seasons={props.seasons}
        initialEp={props.initialEp}
        initialSource={props.initialSource}
        initialAudio={props.initialAudio}
      />
    );
  }

  if (data) {
    return (
      <div className="container page">
        <h1 className="page__title">{anime.title}</h1>
        <p className="empty">No episodes are available on this site for this title yet.</p>
        <WhereToWatch links={props.externalLinks} />
        <p>
          <Link href={`/anime/${anime.id}`}>← Back to details</Link>
        </p>
      </div>
    );
  }

  // The page's shape with the real poster and title, while episode lists load.
  const ep = props.initialEp ?? 1;
  return (
    <div className="watch container">
      <div className="watch__crumbs">
        <Link href="/">Home</Link> / <Link href={`/anime/${anime.id}`}>{anime.title}</Link> / Episode {ep}
      </div>
      <div className="watch__layout">
        <div className="watch__main">
          <div
            className="player player--placeholder player--poster"
            style={{ backgroundImage: props.poster ? `url(${props.poster})` : undefined }}
          >
            {failed ? (
              <div className="player__error">
                Couldn&apos;t load the episode list.
                <div>
                  <button className="btn btn--sm" onClick={() => setAttempt((n) => n + 1)}>
                    Try again
                  </button>
                </div>
              </div>
            ) : (
              <span className="player__bigplay is-loading" aria-label="Loading">
                <Icon name="play" size={30} />
              </span>
            )}
          </div>
          <div className="watch__bar">
            <div className="watch__title">
              <div className="watch__sub">Episode {ep}</div>
              <h1>{props.posterTitle ?? anime.title}</h1>
              {props.posterTitle ? (
                <Link className="watch__show" href={`/anime/${anime.id}`}>
                  {anime.title}
                </Link>
              ) : null}
            </div>
            <div className="skel-row">
              {[40, 40, 92, 112, 40].map((w, i) => (
                <div key={i} className="skel skel--btn" style={{ width: w }} />
              ))}
            </div>
          </div>
        </div>
        <aside className="side">
          <div className="episodes">
            <div className="episodes__head">
              <h2>{anime.title}</h2>
            </div>
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="skel skel--ep" />
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
