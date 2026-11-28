"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { QuickHit } from "@/lib/anilist";
import { isManga } from "@/lib/state";
import { getFavorites, getLists, type SavedAnime } from "@/lib/storage";
import { Icon } from "./Menu";

/**
 * Opens something new to watch (or read, in manga mode), recommended from the titles you liked:
 * favourites count most, then high scores, then what you finished or are on now.
 */
export default function PickForMe({ manga }: { manga: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function pick() {
    if (busy) return;
    setBusy(true);
    const lists = Object.values(getLists());
    const favs = Object.values(getFavorites()).filter((f) => f.on);
    const ofType = (a: SavedAnime) => isManga(a) === manga;

    const weight = new Map<number, number>();
    for (const f of favs) if (ofType(f)) weight.set(f.id, 4);
    for (const e of lists) {
      if (!ofType(e) || e.status === "DROPPED" || e.status === "PLANNING") continue;
      const w = e.score >= 80 ? 1 + e.score / 25 : e.score > 0 && e.score < 60 ? 0 : e.status === "COMPLETED" || e.status === "REPEATING" ? 1.5 : 1;
      if (w > 0) weight.set(e.id, Math.max(weight.get(e.id) ?? 0, w));
    }
    const seeds = [...weight].map(([id, w]) => ({ id, weight: w })).sort((a, b) => b.weight - a.weight).slice(0, 25);
    const exclude = lists.map((e) => e.id);

    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: manga ? "MANGA" : "ANIME", seeds, exclude }),
      });
      const d = (await res.json()) as { pick?: QuickHit | null };
      if (d.pick) router.push(d.pick.type === "MANGA" ? `/manga/${d.pick.id}` : `/anime/${d.pick.id}`);
    } catch {
      /* try again later */
    } finally {
      setBusy(false);
    }
  }

  const what = manga ? "a manga" : "an anime";
  return (
    <button
      type="button"
      className={`search__pick ${busy ? "is-busy" : ""}`}
      onClick={pick}
      aria-label={`Pick ${what} for me`}
      title={`Pick ${what} for me, based on what you liked`}
    >
      <Icon name="shuffle" size={16} />
    </button>
  );
}
