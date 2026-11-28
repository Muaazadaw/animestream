"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatLabel, prettyEnum, type QuickHit } from "@/lib/anilist";

// Results by search text, so typing back over a word doesn't ask again.
const cache = new Map<string, QuickHit[]>();

/** Anime and manga matching the search box, shown under it while it has focus. The current mode's type comes first. */
export default function SearchSuggestions({ q, manga, onPick }: { q: string; manga: boolean; onPick: () => void }) {
  const term = q.trim().toLowerCase();
  const [hits, setHits] = useState<QuickHit[] | null>(null);

  useEffect(() => {
    if (term.length < 2) return setHits(null);
    const known = cache.get(term);
    if (known) return setHits(known);
    // Wait for a pause in typing before asking.
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d: { results?: QuickHit[] }) => {
          cache.set(term, d.results ?? []);
          setHits(d.results ?? []);
        })
        .catch(() => {});
    }, 250);
    return () => (clearTimeout(t), ctrl.abort());
  }, [term]);

  if (term.length < 2 || !hits) return null;
  const want = manga ? "MANGA" : "ANIME";
  const sorted = [...hits].sort((a, b) => Number(b.type === want) - Number(a.type === want));

  return (
    <div className="ssug" role="listbox">
      {sorted.length === 0 ? <p className="ssug__empty">No anime or manga called “{q.trim()}”.</p> : null}
      {sorted.map((h) => (
        <Link key={h.id} href={h.type === "MANGA" ? `/manga/${h.id}` : `/anime/${h.id}`} className="ssug__item" role="option" onClick={onPick}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {h.cover ? <img src={h.cover} alt="" loading="lazy" decoding="async" /> : <span className="ssug__cover" />}
          <span className="ssug__text">
            <strong>{h.title}</strong>
            <span>
              {[h.type === "MANGA" ? formatLabel(h) || "Manga" : "Anime", h.type !== "MANGA" && prettyEnum(h.format), h.year].filter(Boolean).join(" · ")}
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}
