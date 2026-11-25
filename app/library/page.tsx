"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { HistoryCard, useHistory } from "@/components/ContinueWatching";
import { getWatchlist, STORAGE_EVENT, toggleWatchlist, type SavedAnime } from "@/lib/storage";

export default function LibraryPage() {
  const history = useHistory();
  const [list, setList] = useState<SavedAnime[]>([]);

  useEffect(() => {
    const sync = () => setList(getWatchlist());
    sync();
    window.addEventListener(STORAGE_EVENT, sync);
    return () => window.removeEventListener(STORAGE_EVENT, sync);
  }, []);

  return (
    <div className="container page">
      <h1 className="page__title">My List</h1>

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
