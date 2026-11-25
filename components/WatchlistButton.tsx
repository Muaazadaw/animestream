"use client";

import { useEffect, useState } from "react";
import { inWatchlist, STORAGE_EVENT, toggleWatchlist, type SavedAnime } from "@/lib/storage";

export default function WatchlistButton({ anime }: { anime: SavedAnime }) {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const sync = () => setSaved(inWatchlist(anime.id));
    sync();
    window.addEventListener(STORAGE_EVENT, sync);
    return () => window.removeEventListener(STORAGE_EVENT, sync);
  }, [anime.id]);

  return (
    <button className={`btn ${saved ? "btn--saved" : ""}`} onClick={() => setSaved(toggleWatchlist(anime))}>
      {saved ? "✓ In My List" : "+ Add to List"}
    </button>
  );
}
