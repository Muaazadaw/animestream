"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { prettyEnum, statusDot, titleOf, type LatestEpisode } from "@/lib/anilist";
import { Icon } from "./Menu";

const PER_PAGE = 21;

function ago(airingAt: number) {
  const s = Date.now() / 1000 - airingAt;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

/** Episodes that aired in the last few days, newest first, paged. */
export default function LatestEpisodes({ items }: { items: LatestEpisode[] }) {
  const [page, setPage] = useState(0);
  // "1h ago" depends on the viewer's clock; render it after mount to avoid hydration mismatches.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const pages = Math.max(1, Math.ceil(items.length / PER_PAGE));
  const shown = items.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);

  return (
    <section className="latest">
      <div className="row__head">
        <h2>Latest Episodes</h2>
        {pages > 1 ? (
          <div className="pager-pill">
            <button disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous page">
              <Icon name="prev" size={14} />
            </button>
            <span>
              {page + 1}/{pages}
            </span>
            <button disabled={page >= pages - 1} onClick={() => setPage(page + 1)} aria-label="Next page">
              <Icon name="next" size={14} />
            </button>
          </div>
        ) : null}
      </div>
      <div className="latest__grid">
        {shown.map(({ media: m, episode, airingAt }) => (
          <Link key={m.id} href={`/watch/${m.id}?ep=${episode}`} className="pcard">
            <span className="pcard__img">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.coverImage.large ?? undefined} alt="" loading="lazy" />
              <span className="pcard__ep">EP {episode}</span>
              <span className="pcard__ago">{mounted ? ago(airingAt) : ""}</span>
            </span>
            <span className="chips">
              <span>
                <Icon name="cc" size={11} /> {episode}
              </span>
              {m.format ? <span>{prettyEnum(m.format)}</span> : null}
              {m.seasonYear ? <span>{m.seasonYear}</span> : null}
            </span>
            <span className="pcard__title">
              <i className={`dot ${statusDot(m.status)}`} />
              {titleOf(m.title)}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
