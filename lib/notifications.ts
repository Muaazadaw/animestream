"use client";

// Notifications built from the viewer's library plus fresh AniList data.
// "Aired": new episodes of shows they watch or plan to, and new seasons
// (announced or airing) of shows they've watched or planned. "Upcoming":
// next episodes and season premieres with a date.

import { useEffect, useMemo, useState } from "react";
import type { AnimeInfoResponse } from "@/app/api/anime-info/route";
import { titleOf } from "./anilist";
import { exportState, isSeen, markSeen, STORAGE_EVENT } from "./storage";
import type { LibraryState } from "./state";

export type Notification = {
  id: string;
  kind: "episode" | "season" | "upcoming";
  animeId: number;
  title: string;
  /** Short chip, e.g. "EP 9" or "New season". */
  label: string;
  cover: string | null;
  banner: string | null;
  href: string;
  /** ms: when it aired / will air, for sorting and "2 days ago" / "in 3 days". */
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
  return "TBA";
}

export function buildNotifications(s: LibraryState, info: AnimeInfoResponse): { aired: Notification[]; upcoming: Notification[] } {
  const { watching, planning } = trackedIds(s);
  const aired: Notification[] = [];
  const upcoming: Notification[] = [];
  const now = Date.now();
  const progressOf = (id: number) => s.lists[id]?.progress ?? 0;

  for (const a of info.aired) {
    if (!watching.has(a.mediaId) && !planning.has(a.mediaId)) continue;
    if (progressOf(a.mediaId) >= a.episode) continue;
    const m = info.media[a.mediaId];
    if (!m) continue;
    aired.push({
      id: `ep:${a.mediaId}:${a.episode}`,
      kind: "episode",
      animeId: a.mediaId,
      title: titleOf(m.title),
      label: `EP ${a.episode}`,
      cover: m.coverImage.large,
      banner: m.bannerImage,
      href: `/watch/${a.mediaId}?ep=${a.episode}`,
      time: a.airingAt * 1000,
    });
  }

  for (const id of new Set([...watching, ...planning])) {
    const m = info.media[id];
    const next = m?.nextAiringEpisode;
    if (!m || !next || next.airingAt * 1000 - now > 14 * 86400_000) continue;
    upcoming.push({
      id: `next:${id}:${next.episode}`,
      kind: "upcoming",
      animeId: id,
      title: titleOf(m.title),
      label: `EP ${next.episode}`,
      cover: m.coverImage.large,
      banner: m.bannerImage,
      href: `/anime/${id}`,
      time: next.airingAt * 1000,
    });
  }

  // New seasons: sequels that are announced or airing, that the viewer hasn't started.
  const started = new Set(
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
      if (e.relationType !== "SEQUEL" || n.type !== "ANIME" || started.has(n.id) || seenSequel.has(n.id)) continue;
      if (n.status !== "NOT_YET_RELEASED" && n.status !== "RELEASING") continue;
      seenSequel.add(n.id);
      const start = n.startDate.year ? new Date(n.startDate.year, (n.startDate.month ?? 1) - 1, n.startDate.day ?? 1).getTime() : 0;
      const base = {
        animeId: n.id,
        title: titleOf(n.title),
        cover: n.coverImage.large,
        banner: n.bannerImage ?? m.bannerImage,
        href: `/anime/${n.id}`,
      };
      aired.push({
        ...base,
        id: `season:${n.id}:${n.status}`,
        kind: "season",
        label: n.status === "RELEASING" ? "New season · Airing" : `New season · ${seasonLabel(n)}`,
        time: n.status === "RELEASING" ? Math.min(start || now, now) : now - 60_000,
      });
      if (n.status === "NOT_YET_RELEASED" && start > now) {
        upcoming.push({ ...base, id: `premiere:${n.id}`, kind: "upcoming", label: "Premiere", time: start });
      }
    }
  }

  return {
    aired: aired.sort((a, b) => b.time - a.time).slice(0, 60),
    upcoming: upcoming.sort((a, b) => a.time - b.time).slice(0, 60),
  };
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

  const lists = useMemo(() => (state && info ? buildNotifications(state, info) : { aired: [], upcoming: [] }), [state, info]);
  const unread = state ? lists.aired.filter((n) => !isSeen(state.seen, n.id)).length : 0;

  return {
    ...lists,
    unread,
    loading,
    isRead: (id: string) => !!state && isSeen(state.seen, id),
    setRead: (id: string, read: boolean) => markSeen([id], read),
    markAllRead: () => markSeen(lists.aired.map((n) => n.id)),
  };
}
