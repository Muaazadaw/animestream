"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { HistoryCard, useHistory } from "@/components/ContinueWatching";
import { LIST_STATUSES, type ListStatus } from "@/lib/state";
import {
  getLists,
  getWatchlist,
  setListStatus,
  STORAGE_EVENT,
  toggleWatchlist,
  type ListEntry,
  type SavedAnime,
} from "@/lib/storage";
import { useAccount } from "@/lib/sync";

export default function LibraryPage() {
  const history = useHistory();
  const { user } = useAccount();
  const [list, setList] = useState<SavedAnime[]>([]);
  const [lists, setLists] = useState<ListEntry[]>([]);
  const [tab, setTab] = useState<ListStatus>("CURRENT");

  useEffect(() => {
    const sync = () => {
      setList(getWatchlist());
      setLists(Object.values(getLists()).sort((a, b) => b.updatedAt - a.updatedAt));
    };
    sync();
    window.addEventListener(STORAGE_EVENT, sync);
    return () => window.removeEventListener(STORAGE_EVENT, sync);
  }, []);

  const inTab = lists.filter((l) => l.status === tab);

  return (
    <div className="container page">
      <h1 className="page__title">My List</h1>
      {user === null ? (
        <p className="notice">
          Saved in this browser only. <Link href="/account">Sign in</Link> to sync across devices, or import from AniList /
          MyAnimeList.
        </p>
      ) : null}

      <h2 className="section-title">Continue watching</h2>
      {history.length === 0 ? (
        <p className="empty">Nothing watched yet.</p>
      ) : (
        <div className="grid grid--wide">
          {history.map((h) => (
            <HistoryCard key={h.id} h={h} />
          ))}
        </div>
      )}

      <div className="section-head">
        <h2 className="section-title">Lists</h2>
        <Link href="/account" className="muted">
          Import from AniList / MAL
        </Link>
      </div>
      <div className="tabs">
        {LIST_STATUSES.map((s) => {
          const n = lists.filter((l) => l.status === s.id).length;
          return (
            <button key={s.id} className={tab === s.id ? "is-active" : ""} onClick={() => setTab(s.id)}>
              {s.label} <span className="muted">{n}</span>
            </button>
          );
        })}
      </div>
      {inTab.length === 0 ? (
        <p className="empty">Nothing here yet.</p>
      ) : (
        <div className="grid">
          {inTab.map((a) => (
            <div className="card" key={a.id}>
              <Link href={`/anime/${a.id}`} className="card__img">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.cover ?? ""} alt="" loading="lazy" />
                <span className="card__badge">
                  {a.progress}/{a.episodes ?? "?"}
                </span>
                {a.episodes ? (
                  <span className="progress">
                    <span style={{ width: `${Math.min(100, (a.progress / a.episodes) * 100)}%` }} />
                  </span>
                ) : null}
              </Link>
              <div className="card__title">{a.title}</div>
              <div className="card__meta">
                <Link href={`/watch/${a.id}?ep=${a.episodes ? Math.min(a.progress + 1, a.episodes) : a.progress + 1}`}>Watch</Link>
                <select
                  className="card__status"
                  value={a.status}
                  onChange={(e) => setListStatus(a, (e.target.value || null) as ListStatus | null)}
                  aria-label="Move to list"
                >
                  {LIST_STATUSES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                  <option value="">Remove</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 className="section-title">Watchlist</h2>
      {list.length === 0 ? (
        <p className="empty">
          Your watchlist is empty. <Link href="/search">Find something to watch</Link>.
        </p>
      ) : (
        <div className="grid">
          {list.map((a) => (
            <div className="card" key={a.id}>
              <Link href={`/anime/${a.id}`} className="card__img">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.cover ?? ""} alt="" loading="lazy" />
              </Link>
              <div className="card__title">{a.title}</div>
              <div className="card__meta">
                <Link href={`/watch/${a.id}`}>Watch</Link>
                <button className="link-btn" onClick={() => toggleWatchlist(a)}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
