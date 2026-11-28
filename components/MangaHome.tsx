"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatLabel, statusDot, titleOf, type MediaCard } from "@/lib/anilist";
import { getLists, STORAGE_EVENT, type ListEntry } from "@/lib/storage";
import { isManga } from "@/lib/state";
import { Icon } from "./Menu";

function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

/** A poster card for manga: cover, a badge in each bottom corner, chips and title. */
function MangaPoster({
  m,
  href,
  left,
  right,
}: {
  m: Pick<MediaCard, "id" | "title" | "coverImage" | "format" | "status" | "chapters" | "seasonYear" | "averageScore">;
  href: string;
  left?: string | null;
  right?: string | null;
}) {
  return (
    <Link href={href} className="pcard">
      <span className="pcard__img">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={m.coverImage.large ?? undefined} alt="" loading="lazy" />
        <span className="mcard__type">{formatLabel(m) || "Manga"}</span>
        {left ? <span className="pcard__ep">{left}</span> : null}
        {right ? <span className="pcard__ago">{right}</span> : null}
      </span>
      <span className="pcard__title">
        <i className={`dot ${statusDot(m.status)}`} />
        {titleOf(m.title)}
      </span>
    </Link>
  );
}

/** Manga in your list that you're reading, with your place in each. */
export function ContinueReading() {
  const [items, setItems] = useState<ListEntry[]>([]);
  useEffect(() => {
    const sync = () =>
      setItems(
        Object.values(getLists())
          .filter((l) => isManga(l) && (l.status === "CURRENT" || l.status === "REPEATING"))
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, 18),
      );
    sync();
    window.addEventListener(STORAGE_EVENT, sync);
    return () => window.removeEventListener(STORAGE_EVENT, sync);
  }, []);
  if (items.length === 0) return null;
  return (
    <section className="mshelf">
      <div className="row__head">
        <div className="mshelf__title">
          <h2>Continue Reading</h2>
          <span>From your list</span>
        </div>
        <Link href="/library" className="row__more">
          My List
        </Link>
      </div>
      <div className="mshelf__track">
        {items.map((l) => (
          <Link key={l.id} href={`/manga/${l.id}`} className="pcard">
            <span className="pcard__img">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={l.cover ?? undefined} alt="" loading="lazy" />
              <span className="pcard__ep">
                Ch. {l.progress}
                {l.chapters ? ` / ${l.chapters}` : ""}
              </span>
              {l.chapters ? (
                <span className="progress">
                  <span style={{ width: `${Math.min(100, (l.progress / l.chapters) * 100)}%` }} />
                </span>
              ) : null}
            </span>
            <span className="pcard__title">{l.title}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** One shelf with tabs (Trending / Popular / Top rated / Manhwa). */
export function TabbedShelf({ tabs }: { tabs: { id: string; label: string; items: MediaCard[] }[] }) {
  const [tab, setTab] = useState(tabs[0]?.id);
  const current = tabs.find((t) => t.id === tab) ?? tabs[0];
  return (
    <section className="mshelf">
      <div className="row__head">
        <div className="mshelf__title">
          <h2>{current.label}</h2>
          <span>Right now on AniList</span>
        </div>
        <div className="mtabs">
          {tabs.map((t) => (
            <button key={t.id} className={t.id === current.id ? "is-active" : ""} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mshelf__track">
        {current.items.map((m) => (
          <MangaPoster
            key={m.id}
            m={m}
            href={`/manga/${m.id}`}
            left={m.chapters ? `${m.chapters} ch` : m.status === "RELEASING" ? "Ongoing" : null}
            right={m.averageScore ? `★ ${(m.averageScore / 10).toFixed(1)}` : null}
          />
        ))}
      </div>
    </section>
  );
}

export type LatestItem = { manga: MediaCard; number: string; chapterId: string; at: string };

const PER_PAGE = 21;

/** Newest chapters, paged like Latest Episodes on the anime side. */
export function LatestChapters({ items }: { items: LatestItem[] }) {
  const [page, setPage] = useState(0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const pages = Math.max(1, Math.ceil(items.length / PER_PAGE));
  const shown = items.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);

  return (
    <section className="latest">
      <div className="row__head">
        <div className="mshelf__title">
          <h2>Latest Updates</h2>
          <span>Fresh chapters</span>
        </div>
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
      {items.length === 0 ? (
        <p className="empty">Couldn&apos;t load the latest chapters right now.</p>
      ) : (
        <div className="latest__grid">
          {shown.map((it) => (
            <MangaPoster
              key={it.chapterId}
              m={it.manga}
              href={`/manga/${it.manga.id}`}
              left={`Ch. ${it.number}`}
              right={mounted ? ago(it.at) : ""}
            />
          ))}
        </div>
      )}
    </section>
  );
}
