"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar, useProfile } from "@/components/AccountMenu";
import { HistoryCard, useHistory } from "@/components/ContinueWatching";
import { Icon } from "@/components/Menu";
import type { AnimeInfo } from "@/app/api/anime-info/route";
import { formatLabel, prettyEnum, statusDot } from "@/lib/anilist";
import { fetchAnimeInfo } from "@/lib/notifications";
import { isManga, LIST_STATUSES, type ListStatus } from "@/lib/state";
import {
  createCustomList,
  deleteCustomList,
  getCustomLists,
  getFavorites,
  getLists,
  getWatchlist,
  inWatchlist,
  setListStatus,
  STORAGE_EVENT,
  toggleFavorite,
  toggleInCustomList,
  toggleWatchlist,
  type CustomList,
  type ListEntry,
  type SavedAnime,
} from "@/lib/storage";
import { useAccount } from "@/lib/sync";
import { getMode } from "@/lib/mode";
import { openListEditor } from "@/lib/list-editor";
import { openSettings } from "@/lib/settings-modal";

type Entry = ListEntry & { favorite: boolean };
type View = "ALL" | "FAVORITES" | "HISTORY" | ListStatus | `custom:${string}`;

/** The list picked last (All, a status, a custom list…), so the page reopens on it. */
const VIEW_KEY = "as:library-view";
const isView = (v: string): v is View =>
  v === "ALL" || v === "FAVORITES" || v === "HISTORY" || LIST_STATUSES.some((s) => s.id === v) || v.startsWith("custom:");

const STATUS_ICON: Record<ListStatus, string> = {
  CURRENT: "play",
  PLANNING: "bookmark",
  COMPLETED: "check",
  REPEATING: "rewatch",
  PAUSED: "pause",
  DROPPED: "dropped",
};
const STATUS_LABEL: Record<ListStatus, string> = {
  CURRENT: "Watching",
  PLANNING: "Planning",
  COMPLETED: "Completed",
  REPEATING: "Re-Watching",
  PAUSED: "Paused",
  DROPPED: "Dropped",
};
// The Manga tab talks about reading instead.
const MANGA_STATUS_LABEL: Record<ListStatus, string> = {
  ...STATUS_LABEL,
  CURRENT: "Reading",
  PLANNING: "Plan to read",
  REPEATING: "Re-Reading",
};
const SIDEBAR_ORDER: ListStatus[] = ["CURRENT", "PLANNING", "COMPLETED", "REPEATING", "PAUSED", "DROPPED"];
const TYPES = ["TV", "MOVIE", "OVA", "ONA", "SPECIAL", "TV_SHORT"];
const AIRING = [
  { id: "RELEASING", label: "Airing" },
  { id: "FINISHED", label: "Finished" },
  { id: "NOT_YET_RELEASED", label: "Not yet aired" },
];

/** Everything in the viewer's lists, plus old watchlist items as Planning. */
function useLibrary() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [custom, setCustom] = useState<CustomList[]>([]);
  useEffect(() => {
    const sync = () => {
      const lists = getLists();
      const favs = getFavorites();
      const all: Entry[] = Object.values(lists).map((l) => ({ ...l, favorite: !!favs[l.id]?.on }));
      for (const w of getWatchlist()) {
        if (!lists[w.id]) {
          all.push({ ...w, status: "PLANNING", progress: 0, score: 0, updatedAt: w.addedAt ?? 0, favorite: !!favs[w.id]?.on });
        }
      }
      // Favourites that aren't in any list still show under Favourites.
      for (const f of Object.values(favs)) {
        if (f.on && !all.some((e) => e.id === f.id)) all.push({ ...f, status: "PLANNING", progress: 0, score: 0, favorite: true });
      }
      setEntries(all.sort((a, b) => b.updatedAt - a.updatedAt));
      setCustom(getCustomLists());
    };
    sync();
    window.addEventListener(STORAGE_EVENT, sync);
    return () => window.removeEventListener(STORAGE_EVENT, sync);
  }, []);
  return { entries, custom };
}

/** The status badge on a card: opens the list editor (status, progress, score, dates, notes…). */
function CardMenu({ entry }: { entry: Entry; custom: CustomList[] }) {
  const anime: SavedAnime = {
    id: entry.id,
    title: entry.title,
    cover: entry.cover,
    format: entry.format,
    episodes: entry.episodes,
    ...(isManga(entry) ? { type: "MANGA" as const, chapters: entry.chapters ?? null, countryOfOrigin: entry.countryOfOrigin ?? null } : {}),
  };
  return (
    <div className="lcard__menu">
      <button className="lcard__badge" onClick={(e) => (e.preventDefault(), openListEditor(anime))} aria-label="Edit list entry" title="Edit list entry">
        <Icon name={STATUS_ICON[entry.status]} size={14} />
      </button>
    </div>
  );
}

export default function LibraryPage() {
  const { user, display, createdAt } = useAccount();
  const profile = useProfile();
  const history = useHistory();
  const { entries, custom } = useLibrary();
  const [view, setView] = useState<View>("ALL");
  const [type, setType] = useState("");
  const [kind, setKind] = useState<"" | "ANIME" | "MANGA">("");
  const [airing, setAiring] = useState("");
  const [q, setQ] = useState("");
  const [info, setInfo] = useState<Record<number, AnimeInfo>>({});
  const [newList, setNewList] = useState("");

  // Opens on the list picked last time (so coming back from a show keeps it);
  // /library?view=history (from Settings) opens Continue watching instead.
  const restored = useRef(false);
  useEffect(() => {
    if (getMode() === "manga") setKind("MANGA");
    if (new URLSearchParams(window.location.search).get("view") === "history") setView("HISTORY");
    else {
      try {
        const saved = localStorage.getItem(VIEW_KEY);
        if (saved && isView(saved)) setView(saved);
      } catch {
        /* storage unavailable */
      }
    }
    restored.current = true;
  }, []);
  useEffect(() => {
    if (!restored.current) return;
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      /* storage unavailable */
    }
  }, [view]);

  // Year, score and airing status for the cards.
  const idsKey = entries.map((e) => e.id).sort((a, b) => a - b).join(",");
  useEffect(() => {
    if (!idsKey) return;
    let cancelled = false;
    fetchAnimeInfo(idsKey.split(",").map(Number).slice(0, 300))
      .then((d) => !cancelled && setInfo(d.media))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [idsKey]);

  // Counts follow the All / Anime / Manga tab, like the list itself.
  const counts = useMemo(() => {
    const mine = kind ? entries.filter((e) => (kind === "MANGA") === isManga(e)) : entries;
    const c: Record<string, number> = { ALL: mine.length, FAVORITES: mine.filter((e) => e.favorite).length };
    for (const e of mine) c[e.status] = (c[e.status] ?? 0) + 1;
    return c;
  }, [entries, kind]);

  const customView = view.startsWith("custom:") ? custom.find((c) => `custom:${c.id}` === view) : null;
  // A remembered custom list that's since been deleted: back to All.
  useEffect(() => {
    if (restored.current && view.startsWith("custom:") && !customView) setView("ALL");
  }, [view, customView]);
  // On the Manga tab, "Continue reading" is what you're reading now (watch history is anime only).
  const mangaHistory = kind === "MANGA";
  const continueReading = useMemo(
    () =>
      entries
        .filter((e) => isManga(e) && (e.status === "CURRENT" || e.status === "REPEATING"))
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [entries],
  );
  const shown = useMemo(() => {
    let list: Entry[];
    if (view === "HISTORY" && mangaHistory) list = continueReading;
    else if (customView) {
      list = customView.items.map(
        (a) => entries.find((e) => e.id === a.id) ?? { ...a, status: "PLANNING" as const, progress: 0, score: 0, updatedAt: 0, favorite: false },
      );
    } else if (view === "FAVORITES") list = entries.filter((e) => e.favorite);
    else if (view === "ALL" || view === "HISTORY") list = entries;
    else list = entries.filter((e) => e.status === view);
    const term = q.trim().toLowerCase();
    return list.filter((e) => {
      const m = info[e.id];
      if (kind && (kind === "MANGA") !== isManga(e)) return false;
      if (type && (m?.format ?? e.format) !== type) return false;
      if (airing && m?.status !== airing) return false;
      if (term && !e.title.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [entries, view, customView, q, type, kind, airing, info, mangaHistory, continueReading]);

  const name = display ?? profile.anilist?.name ?? user ?? "…";
  const reading = kind === "MANGA";
  const labels = reading ? MANGA_STATUS_LABEL : STATUS_LABEL;
  const historyLabel = reading ? "Continue reading" : "Continue watching";
  const viewLabel =
    view === "ALL" ? (reading ? "Reading list" : "Watchlist") : view === "FAVORITES" ? "Favorites" : view === "HISTORY" ? historyLabel : customView ? customView.name : labels[view as ListStatus];

  return (
    <div className="container page profile">
      <section className="profile__head">
        <Avatar src={profile.avatar} name={name} size={96} />
        <div className="profile__who">
          <h1>{name}</h1>
          <span className="muted">
            {createdAt
              ? `Joined ${new Date(createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
              : null}
          </span>
        </div>
        <div className="profile__stats">
          <div>
            <strong>{entries.filter((e) => !isManga(e)).length}</strong>
            <span>Anime</span>
          </div>
          <div>
            <strong>{entries.filter(isManga).length}</strong>
            <span>Manga</span>
          </div>
          <div>
            <strong>{counts.COMPLETED ?? 0}</strong>
            <span>Completed</span>
          </div>
          <div>
            <strong>{entries.reduce((n, e) => n + (isManga(e) ? 0 : e.progress || 0), 0).toLocaleString()}</strong>
            <span>Episodes</span>
          </div>
          <div>
            <strong>{entries.reduce((n, e) => n + (isManga(e) ? e.progress || 0 : 0), 0).toLocaleString()}</strong>
            <span>Chapters</span>
          </div>
        </div>
      </section>

      <div className="profile__body">
        <aside className="lside">
          <div className="mtabs lside__kind">
            {([["", "All"], ["ANIME", "Anime"], ["MANGA", "Manga"]] as const).map(([k, label]) => (
              <button key={k} className={kind === k ? "is-active" : ""} onClick={() => setKind(k)}>
                {label}
              </button>
            ))}
          </div>
          <div className="lside__filters">
            <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">All types</option>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {prettyEnum(t)}
                </option>
              ))}
            </select>
            <select className="select" value={airing} onChange={(e) => setAiring(e.target.value)}>
              <option value="">All airing statuses</option>
              {AIRING.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          <input className="lside__search" placeholder="Filter by title" value={q} onChange={(e) => setQ(e.target.value)} />

          <nav className="lside__group">
            <button className={view === "ALL" ? "is-active" : ""} onClick={() => setView("ALL")}>
              <span>All statuses</span>
              <em>{counts.ALL ?? 0}</em>
            </button>
            <button className={view === "FAVORITES" ? "is-active" : ""} onClick={() => setView("FAVORITES")}>
              <Icon name="heart" size={15} />
              <span>Favorites</span>
              <em>{counts.FAVORITES ?? 0}</em>
            </button>
            {SIDEBAR_ORDER.map((s) => (
              <button key={s} className={view === s ? "is-active" : ""} onClick={() => setView(s)}>
                <Icon name={STATUS_ICON[s]} size={15} />
                <span>{labels[s]}</span>
                <em>{counts[s] ?? 0}</em>
              </button>
            ))}
            <button className={view === "HISTORY" ? "is-active" : ""} onClick={() => setView("HISTORY")}>
              <Icon name="rewatch" size={15} />
              <span>{historyLabel}</span>
              <em>{mangaHistory ? continueReading.length : history.length}</em>
            </button>
          </nav>

          <div className="lside__label">Custom lists</div>
          <nav className="lside__group">
            {custom.length === 0 ? <p className="lside__empty">No custom lists yet.</p> : null}
            {custom.map((c) => (
              <div key={c.id} className={`lside__custom ${view === `custom:${c.id}` ? "is-active" : ""}`}>
                <button onClick={() => setView(`custom:${c.id}`)}>
                  <span>{c.name}</span>
                  <em>{c.items.length}</em>
                </button>
                <button
                  className="lside__del"
                  aria-label={`Delete ${c.name}`}
                  onClick={() => {
                    if (confirm(`Delete the list "${c.name}"?`)) {
                      deleteCustomList(c.id);
                      if (view === `custom:${c.id}`) setView("ALL");
                    }
                  }}
                >
                  <Icon name="trash" size={13} />
                </button>
              </div>
            ))}
            <form
              className="lside__new"
              onSubmit={(e) => {
                e.preventDefault();
                if (!newList.trim()) return;
                const l = createCustomList(newList);
                setNewList("");
                setView(`custom:${l.id}`);
              }}
            >
              <input placeholder="Create custom list" value={newList} onChange={(e) => setNewList(e.target.value)} maxLength={40} />
              <button aria-label="Create list">
                <Icon name="plus" size={15} />
              </button>
            </form>
          </nav>
          <Link href="/settings#anilist" className="lside__import" onClick={(e) => (e.preventDefault(), openSettings("connections"))}>
            Import from AniList / MAL
          </Link>
        </aside>

        <section className="lmain">
          <h2 className="lmain__title">
            {viewLabel} <span>{view === "HISTORY" && !mangaHistory ? history.length : shown.length}</span>
          </h2>

          {view === "HISTORY" && !mangaHistory ? (
            history.length === 0 ? (
              <p className="empty">Nothing watched yet.</p>
            ) : (
              <div className="grid grid--wide">
                {history.map((h) => (
                  <HistoryCard key={h.id} h={h} />
                ))}
              </div>
            )
          ) : shown.length === 0 ? (
            <p className="empty">
              {entries.length === 0 ? (
                <>
                  Your list is empty. <Link href="/search">Find something to watch</Link> or{" "}
                  <Link href="/settings#anilist" onClick={(e) => (e.preventDefault(), openSettings("connections"))}>import from AniList / MAL</Link>.
                </>
              ) : (
                "Nothing matches."
              )}
            </p>
          ) : (
            <div className="lgrid">
              {shown.map((e) => {
                const m = info[e.id];
                const manga = isManga(e);
                const eps = manga ? e.chapters : (m?.episodes ?? e.episodes);
                return (
                  <Link key={e.id} href={manga ? `/manga/${e.id}` : `/anime/${e.id}`} className="lcard">
                    <span className="lcard__img">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={m?.coverImage.large ?? e.cover ?? undefined} alt="" loading="lazy" />
                      <CardMenu entry={e} custom={custom} />
                      {e.favorite ? (
                        <span className="lcard__fav">
                          <Icon name="heart" size={12} />
                        </span>
                      ) : null}
                      {e.progress && eps ? (
                        <span className="progress">
                          <span style={{ width: `${Math.min(100, (e.progress / eps) * 100)}%` }} />
                        </span>
                      ) : null}
                    </span>
                    <span className="lcard__title">
                      <i className={`dot ${statusDot(m?.status)}`} />
                      {e.title}
                    </span>
                    <span className="chips">
                      {m?.format ?? e.format ? <span>{formatLabel({ format: m?.format ?? e.format, countryOfOrigin: m?.countryOfOrigin ?? e.countryOfOrigin })}</span> : null}
                      {m?.seasonYear ? <span>{m.seasonYear}</span> : null}
                      {eps || (manga && e.progress) ? (
                        <span>
                          {manga ? "Ch. " : <Icon name="cc" size={11} />} {e.progress ? `${e.progress}${eps ? "/" : ""}` : ""}
                          {eps ?? ""}
                        </span>
                      ) : null}
                      {m?.averageScore ? <span>★ {m.averageScore}</span> : null}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
