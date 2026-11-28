"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getHistory, removeHistory, STORAGE_EVENT, type HistoryEntry } from "@/lib/storage";
import { usePrefs } from "@/lib/use-prefs";
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

function clock(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

export function HistoryCard({ h }: { h: HistoryEntry }) {
  const pct = h.duration ? Math.min(100, (h.time / h.duration) * 100) : 0;
  return (
    <div className="card card--wide cw">
      <div className="cw__frame">
        <Link href={`/watch/${h.id}?ep=${h.episode}`} className="card__img card__img--wide" aria-label={`Continue ${h.title}, episode ${h.episode}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={h.cover ?? undefined} alt="" loading="lazy" />
          <span className="cw__play" aria-hidden>
            <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor">
              <path d="M8 5.5v13l10.5-6.5z" />
            </svg>
          </span>
          <span className="cw__pill cw__pill--ep">
            EP {h.episode}
            {h.episodes ? ` / ${h.episodes}` : ""}
          </span>
          {h.duration ? (
            <span className="cw__pill cw__pill--time">
              {clock(h.time)} / {clock(h.duration)}
            </span>
          ) : null}
          <span className="cw__bar">
            <span style={{ width: `${pct}%` }} />
          </span>
        </Link>
        <button className="cw__x" onClick={() => removeHistory(h.id)} aria-label={`Remove ${h.title} from Continue Watching`} title="Remove">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      <div className="card__title">{h.title}</div>
      <div className="card__meta">Episode {h.episode}</div>
    </div>
  );
}

export default function ContinueWatching() {
  const items = useHistory();
  const show = usePrefs()?.homeHistory ?? true;
  if (items.length === 0 || !show) return null;
  return (
    <Row title="Continue Watching" href="/library">
      {items.slice(0, 15).map((h) => (
        <HistoryCard key={h.id} h={h} />
      ))}
    </Row>
  );
}
