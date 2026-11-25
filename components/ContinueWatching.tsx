"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getHistory, removeHistory, STORAGE_EVENT, type HistoryEntry } from "@/lib/storage";
import Row from "./Row";

export function useHistory() {
  const [items, setItems] = useState<HistoryEntry[]>([]);
  useEffect(() => {
    const sync = () => setItems(getHistory());
    sync();
    window.addEventListener(STORAGE_EVENT, sync);
    return () => window.removeEventListener(STORAGE_EVENT, sync);
  }, []);
  return items;
}

export function HistoryCard({ h }: { h: HistoryEntry }) {
  const pct = h.duration ? Math.min(100, (h.time / h.duration) * 100) : 0;
  return (
    <div className="card card--wide">
      <Link href={`/watch/${h.id}?ep=${h.episode}`} className="card__img card__img--wide">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={h.cover ?? ""} alt="" loading="lazy" />
        <span className="card__badge">EP {h.episode}</span>
        <span className="card__play" aria-hidden>
          <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
        <span className="progress">
          <span style={{ width: `${pct}%` }} />
        </span>
      </Link>
      <div className="card__title">{h.title}</div>
      <div className="card__meta">
        Episode {h.episode}
        <button className="link-btn" onClick={() => removeHistory(h.id)}>
          Remove
        </button>
      </div>
    </div>
  );
}

export default function ContinueWatching() {
  const items = useHistory();
  if (items.length === 0) return null;
  return (
    <Row title="Continue Watching" href="/library">
      {items.slice(0, 15).map((h) => (
        <HistoryCard key={h.id} h={h} />
      ))}
    </Row>
  );
}
