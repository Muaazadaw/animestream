"use client";

// Notifications built from the viewer's library plus fresh AniList data:
// new episodes of shows they watch or plan to, episodes airing within a day,
// and new seasons (announced or airing) of shows they've watched or planned.

import { useEffect, useMemo, useState } from "react";
import type { AnimeInfoResponse } from "@/app/api/anime-info/route";
import { titleOf } from "./anilist";
import { exportState, markSeen, STORAGE_EVENT } from "./storage";
import type { LibraryState } from "./state";

export type Notification = {
  id: string;
  kind: "episode" | "soon" | "season";
  animeId: number;
  title: string;
  text: string;
  cover: string | null;
  href: string;
  /** ms; for sorting and "2h ago". */
  time: number;
};

const CACHE_KEY = "as:anime-info";
const CACHE_MS = 10 * 60 * 1000;

/** Which shows to ask about, most relevant first. */
function trackedIds(s: LibraryState) {
  const lists = Object.values(s.lists);
  const watching = lists.filter((l) => l.status === "CURRENT" || l.status === "REPEATING").map((l) => l.id);
  const planning = [...lists.filter((l) => l.status === "PLANNING").map((l) => l.id), ...s.watchlist.map((w) => w.id)];
  const recent = s.history.slice(0, 30).map((h) => h.id);
  const completed = lists
    .filter((l) => l.status === "COMPLETED")
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 120)
    .map((l) => l.id);
  return { watching: new Set([...watching, ...recent]), planning: new Set(planning), all: [...new Set([...watching, ...recent, ...planning, ...completed])] };
}

export async function fetchAnimeInfo(ids: number[]): Promise<AnimeInfoResponse> {
  const key = ids.slice().sort((a, b) => a - b).join(",");
  try {
    const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) ?? "null") as { key: string; at: number; data: AnimeInfoResponse } | null;
    if (cached && cached.key === key && Date.now() - cached.at < CACHE_MS) return cached.data;
  } catch {}
  const r = await fetch("/api/anime-info", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  if (!r.ok) throw new Error("Could not load anime info");
  const data = (await r.json()) as AnimeInfoResponse;
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ key, at: Date.now(), data }));
  } catch {}
  return data;
}

function seasonLabel(n: { season: string | null; seasonYear: number | null; startDate: { year: number | null; month: number | null } }) {
  if (n.season && n.seasonYear) return `${n.season[0]}${n.season.slice(1).toLowerCase()} ${n.seasonYear}`;
  if (n.startDate.year) {
    return n.startDate.month
      ? new Date(n.startDate.year, n.startDate.month - 1).toLocaleDateString("en-US", { month: "short", year: "numeric" })
      : String(n.startDate.year);
  }
  return "date TBA";
}

export function buildNotifications(s: LibraryState, info: AnimeInfoResponse): Notification[] {
  const { watching, planning } = trackedIds(s);
  const out: Notification[] = [];
  const now = Date.now();
  const progressOf = (id: number) => s.lists[id]?.progress ?? 0;

  for (const a of info.aired) {
    if (!watching.has(a.mediaId) && !planning.has(a.mediaId)) continue;
    if (progressOf(a.mediaId) >= a.episode) continue;
    const m = info.media[a.mediaId];
    if (!m) continue;
    out.push({
      id: `ep:${a.mediaId}:${a.episode}`,
      kind: "episode",
      animeId: a.mediaId,
      title: titleOf(m.title),
      text: `Episode ${a.episode} is out`,
      cover: m.coverImage.large,
      href: `/watch/${a.mediaId}?ep=${a.episode}`,
      time: a.airingAt * 1000,
    });
  }

  for (const id of watching) {
    const m = info.media[id];
    const next = m?.nextAiringEpisode;
    if (!m || !next || next.airingAt * 1000 - now > 86400_000) continue;
    const hours = Math.max(1, Math.round((next.airingAt * 1000 - now) / 3600_000));
    out.push({
      id: `soon:${id}:${next.episode}`,
      kind: "soon",
      animeId: id,
      title: titleOf(m.title),
      text: `Episode ${next.episode} airs in ${hours}h`,
      cover: m.coverImage.large,
      href: `/anime/${id}`,
      time: now,
    });
  }

  // New seasons: sequels that are announced or airing, that the viewer hasn't started.
  const done = new Set(
    Object.values(s.lists)
      .filter((l) => l.status === "COMPLETED" || l.status === "CURRENT" || l.status === "REPEATING")
      .map((l) => l.id),
  );
  const seenSequel = new Set<number>();
  for (const m of Object.values(info.media)) {
    const status = s.lists[m.id]?.status;
    if (!(status === "COMPLETED" || status === "CURRENT" || status === "REPEATING" || status === "PLANNING")) continue;
    for (const e of m.relations.edges) {
      const n = e.node;
      if (e.relationType !== "SEQUEL" || n.type !== "ANIME" || done.has(n.id) || seenSequel.has(n.id)) continue;
      if (n.status !== "NOT_YET_RELEASED" && n.status !== "RELEASING") continue;
      seenSequel.add(n.id);
      const start = n.startDate.year ? new Date(n.startDate.year, (n.startDate.month ?? 1) - 1, 1).getTime() : 0;
      out.push({
        id: `season:${n.id}:${n.status}`,
        kind: "season",
        animeId: n.id,
        title: titleOf(n.title),
        text:
          n.status === "RELEASING"
            ? `New season of ${titleOf(m.title)} is airing now`
            : `New season of ${titleOf(m.title)} announced · ${seasonLabel(n)}`,
        cover: n.coverImage.large,
        href: `/anime/${n.id}`,
        time: n.status === "RELEASING" ? Math.min(start || now, now) : start && start < now ? start : now - 1,
      });
    }
  }

  return out.sort((a, b) => b.time - a.time).slice(0, 50);
}

/** Notifications plus unread state; refreshes when the library changes. */
export function useNotifications() {
  const [state, setState] = useState<LibraryState | null>(null);
  const [info, setInfo] = useState<AnimeInfoResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const update = () => setState(exportState());
    update();
    window.addEventListener(STORAGE_EVENT, update);
    return () => window.removeEventListener(STORAGE_EVENT, update);
  }, []);

  const idsKey = useMemo(() => (state ? trackedIds(state).all.join(",") : ""), [state]);

  useEffect(() => {
    if (!idsKey) return;
    let cancelled = false;
    setLoading(true);
    fetchAnimeInfo(idsKey.split(",").map(Number))
      .then((d) => !cancelled && setInfo(d))
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [idsKey]);

  const items = useMemo(() => (state && info ? buildNotifications(state, info) : []), [state, info]);
  const unread = state ? items.filter((n) => !state.seen[n.id]).length : 0;

  return {
    items,
    unread,
    loading,
    isUnread: (id: string) => !!state && !state.seen[id],
    markAllRead: () => markSeen(items.map((n) => n.id)),
  };
}
