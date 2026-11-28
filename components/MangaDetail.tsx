"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useChapters, type Chapter } from "@/lib/manga/client";
import { MANGA_SOURCES, sourceName, sourceOf } from "@/lib/manga/sources";
import { getLists, isFavorite, setListStatus, STORAGE_EVENT, toggleFavorite, type ListEntry, type SavedAnime } from "@/lib/storage";
import type { ListStatus } from "@/lib/state";
import { openListEditor } from "@/lib/list-editor";
import Menu, { Icon, MenuItem } from "./Menu";

const STATUSES: { id: ListStatus; label: string; icon: string }[] = [
  { id: "CURRENT", label: "Reading", icon: "play" },
  { id: "PLANNING", label: "Plan to read", icon: "bookmark" },
  { id: "COMPLETED", label: "Completed", icon: "check" },
  { id: "REPEATING", label: "Re-reading", icon: "rewatch" },
  { id: "PAUSED", label: "On hold", icon: "pause" },
  { id: "DROPPED", label: "Dropped", icon: "dropped" },
];

function useEntry(id: number) {
  const [entry, setEntry] = useState<ListEntry | null>(null);
  const [fav, setFav] = useState(false);
  useEffect(() => {
    const sync = () => {
      setEntry(getLists()[id] ?? null);
      setFav(isFavorite(id));
    };
    sync();
    window.addEventListener(STORAGE_EVENT, sync);
    return () => window.removeEventListener(STORAGE_EVENT, sync);
  }, [id]);
  return { entry, fav, setFav };
}

/**
 * The chapter to open next: the one after your progress, or the first. `skips` is
 * true when chapters in between aren't on Mayoi (MangaDex only has some of them).
 */
function nextChapter(chapters: Chapter[], progress: number) {
  const first = parseFloat(chapters[0].number);
  if (!progress) return { chapter: chapters[0], continuing: false, skips: first > 1 };
  const next = chapters.find((c) => parseFloat(c.number) > progress);
  if (!next) return { chapter: chapters[chapters.length - 1], continuing: true, skips: false, caughtUp: true };
  return { chapter: next, continuing: true, skips: Math.floor(parseFloat(next.number)) > Math.floor(progress) + 1 };
}

/** "Ch. 25–254" for the chapters between your progress and the next one Mayoi has. */
function gapLabel(from: number, to: string) {
  const end = Math.ceil(parseFloat(to)) - 1;
  return end > from ? `Ch. ${from}–${end}` : `Ch. ${from}`;
}

/** Continue / Start reading, list status and favourite. */
export function MangaActions({ manga }: { manga: SavedAnime }) {
  const { chapters } = useChapters(manga.id);
  const { entry, fav, setFav } = useEntry(manga.id);
  const saved: SavedAnime = { ...manga, type: "MANGA" };
  const status = STATUSES.find((s) => s.id === entry?.status);
  const progress = entry?.progress ?? 0;
  const target = chapters?.length ? nextChapter(chapters, progress) : null;
  const label = !target
    ? ""
    : target.caughtUp
      ? "Read again"
      : target.skips
        ? "Next available"
        : target.continuing
          ? "Continue"
          : "Start reading";

  return (
    <>
    <div className="hero__actions">
      {chapters === null ? (
        <span className="btn btn--primary btn--disabled">Loading chapters…</span>
      ) : target ? (
        <Link href={`/manga/${manga.id}/read/${target.chapter.id}`} className="btn btn--primary">
          <Icon name="play" size={15} /> {label} · Ch. {target.chapter.number}
        </Link>
      ) : (
        <span className="btn btn--disabled">Not available to read yet</span>
      )}
      <Menu
        className="mstatus"
        label={
          <>
            <Icon name={status?.icon ?? "plus"} size={15} /> {status?.label ?? "Add to List"} <Icon name="chevron" size={14} />
          </>
        }
      >
        {(close) => (
          <>
            {STATUSES.map((s) => (
              <MenuItem
                key={s.id}
                icon={<Icon name={s.icon} size={15} />}
                active={entry?.status === s.id}
                onClick={() => (setListStatus(saved, s.id), close())}
              >
                {s.label}
              </MenuItem>
            ))}
            <MenuItem icon={<Icon name="list" size={15} />} onClick={() => (close(), openListEditor(saved))}>
              Edit entry…
            </MenuItem>
            {entry ? (
              <MenuItem icon={<Icon name="trash" size={15} />} onClick={() => (setListStatus(saved, null), close())}>
                Remove from list
              </MenuItem>
            ) : null}
          </>
        )}
      </Menu>
      <button
        className={`btn btn--icon ${fav ? "btn--saved" : ""}`}
        aria-label={fav ? "Unfavourite" : "Favourite"}
        title={fav ? "Unfavourite" : "Favourite"}
        onClick={() => setFav(toggleFavorite(saved))}
      >
        <Icon name="heart" size={16} />
      </button>
    </div>
    {target?.skips ? (
      <p className="mgap">
        {progress
          ? `You're on Ch. ${progress}. ${gapLabel(progress + 1, target.chapter.number)} aren't available on Mayoi, so this skips ahead.`
          : `Mayoi's copy starts at Ch. ${target.chapter.number}; earlier chapters aren't available.`}
      </p>
    ) : target?.caughtUp && progress > parseFloat(target.chapter.number) ? (
      <p className="mgap">You&apos;re on Ch. {progress}, past the last chapter Mayoi has (Ch. {target.chapter.number}).</p>
    ) : null}
    </>
  );
}

/** Description cut to a few lines with Read more. */
export function ReadMore({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  const long = text.length > 360;
  return (
    <div className="readmore">
      <p className={`detail__desc ${long && !open ? "is-clamped" : ""}`}>{text}</p>
      {long ? (
        <button className="readmore__btn" onClick={() => setOpen(!open)}>
          {open ? "Show less" : "Read more"}
        </button>
      ) : null}
    </div>
  );
}

/** "2d ago", "3w ago", "4mo ago"… */
function ago(iso: string | null) {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.round(s / 86400)}d ago`;
  if (s < 86400 * 30) return `${Math.round(s / (86400 * 7))}w ago`;
  if (s < 86400 * 365) return `${Math.round(s / (86400 * 30))}mo ago`;
  return `${Math.round(s / (86400 * 365))}y ago`;
}

const PER_PAGE = 20;

/** Page numbers to show around the current one: 1 … 4 5 [6] 7 8 … 16 */
function pageWindow(current: number, pages: number): (number | "gap")[] {
  const out: (number | "gap")[] = [];
  for (let i = 0; i < pages; i++) {
    if (i === 0 || i === pages - 1 || Math.abs(i - current) <= 2) out.push(i);
    else if (out[out.length - 1] !== "gap") out.push("gap");
  }
  return out;
}

/** All readable chapters as one list: search, sort, pages of 20, and a bookmark on where you're up to. */
export function ChapterList({ mangaId, novel = false }: { mangaId: number; novel?: boolean }) {
  const { chapters: merged, sources, error } = useChapters(mangaId);
  // "" = every source merged; otherwise one source's own list. Only sources with chapters are offered.
  const [pick, setPick] = useState("");
  const available = MANGA_SOURCES.filter((s) => sources?.[s.id]?.length);
  const picked = available.find((s) => s.id === pick);
  const chapters = picked ? sources![picked.id]! : merged;
  const tagged = !picked && available.length > 1;
  const { entry } = useEntry(mangaId);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"desc" | "asc" | "date">("desc");
  const [page, setPage] = useState(0);
  const top = useRef<HTMLElement>(null);
  const progress = entry?.progress ?? 0;

  const term = q.trim();
  const shown = useMemo(() => {
    let list = [...(chapters ?? [])];
    if (sort === "desc") list.reverse();
    if (sort === "date") list.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
    if (term) list = list.filter((c) => c.number.startsWith(term) || c.title?.toLowerCase().includes(term.toLowerCase()));
    return list;
  }, [chapters, sort, term]);

  const pages = Math.max(1, Math.ceil(shown.length / PER_PAGE));
  const current = Math.min(page, pages - 1);
  const visible = shown.slice(current * PER_PAGE, current * PER_PAGE + PER_PAGE);

  // Open on the page with your next chapter (the lowest number above your progress).
  useEffect(() => {
    if (term || !progress) return setPage(0);
    const next = shown
      .filter((c) => parseFloat(c.number) > progress)
      .reduce<Chapter | null>((m, c) => (!m || parseFloat(c.number) < parseFloat(m.number) ? c : m), null);
    const i = next ? shown.indexOf(next) : 0;
    setPage(i > 0 ? Math.floor(i / PER_PAGE) : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, term, chapters, progress > 0]);

  const goPage = (p: number) => {
    setPage(p);
    // Keep the list in view when the new page is shorter.
    const el = top.current;
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const missing = (() => {
    if (!chapters?.length) return null;
    const last = Math.floor(parseFloat(chapters[chapters.length - 1].number));
    const whole = chapters.filter((c) => Number.isInteger(parseFloat(c.number)) && parseFloat(c.number) >= 1).length;
    return last - whole > 0 ? { have: chapters.length, last } : null;
  })();

  return (
    <section className="chapters" ref={top}>
      <h2 className="chapters__title">
        Chapters <span>{chapters?.length ?? ""}</span>
      </h2>
      {missing ? (
        <p className="mgap chapters__gap">
          Mayoi has {missing.have} of {missing.last}+ chapters for this one. The rest aren&apos;t available in English yet.
        </p>
      ) : null}

      <div className="clist">
        <div className="clist__bar">
          <label className="clist__search">
            <Icon name="search" size={14} />
            <input placeholder="Search chapter number…" inputMode="decimal" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <span className="clist__pill">
            <em>Lang</em> English
          </span>
          {available.length > 1 ? (
            <label className="clist__pill clist__source">
              <em>Source</em>
              <select value={picked?.id ?? ""} onChange={(e) => setPick(e.target.value)} aria-label="Chapter source">
                <option value="">All sources</option>
                {available.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({sources![s.id]!.length})
                  </option>
                ))}
              </select>
            </label>
          ) : available.length === 1 ? (
            <span className="clist__pill">
              <em>Source</em> {available[0].name}
            </span>
          ) : null}
          <span className="clist__sort">
            <em>Sort</em>
            <button className={sort !== "date" ? "is-active" : ""} onClick={() => setSort(sort === "desc" ? "asc" : "desc")}>
              Chapter {sort === "asc" ? "↑" : "↓"}
            </button>
            <button className={sort === "date" ? "is-active" : ""} onClick={() => setSort("date")}>
              Date
            </button>
          </span>
        </div>

        {chapters === null ? (
          <div className="clist__rows">
            {Array.from({ length: 8 }, (_, i) => (
              <span key={i} className="crow crow--skeleton" />
            ))}
          </div>
        ) : chapters.length === 0 ? (
          <p className="empty clist__empty">
            {novel
              ? "Novels can't be read on Mayoi yet."
              : error
                ? "Couldn't load chapters right now. Try again in a bit."
                : "No chapters available to read on Mayoi yet."}
          </p>
        ) : shown.length === 0 ? (
          <p className="empty clist__empty">No chapter matches “{q}”.</p>
        ) : (
          <div className="clist__rows">
            {visible.map((c) => {
              const n = parseFloat(c.number);
              const read = n <= progress;
              const here = progress > 0 && Math.floor(n) === progress;
              return (
                <Link key={c.id} href={`/manga/${mangaId}/read/${c.id}`} className={`crow ${read ? "is-read" : ""} ${here ? "is-here" : ""}`}>
                  <span className="crow__lang">EN</span>
                  <span className="crow__num">Ch. {c.number}</span>
                  <span className="crow__title">{c.title ?? ""}</span>
                  {tagged ? <span className="crow__src">{sourceName(sourceOf(c.id))}</span> : null}
                  <span className="crow__when" title={c.group ? `Scanlated by ${c.group}` : undefined}>
                    {ago(c.publishedAt)}
                  </span>
                  <span className="crow__mark" title={here ? "You're here" : read ? "Read" : "Not read yet"}>
                    <Icon name="bookmark" size={14} />
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {pages > 1 ? (
        <nav className="cpages" aria-label="Chapter pages">
          {pageWindow(current, pages).map((p, i) =>
            p === "gap" ? (
              <span key={`gap${i}`} className="cpages__gap">
                …
              </span>
            ) : (
              <button key={p} className={p === current ? "is-active" : ""} onClick={() => goPage(p)}>
                {p + 1}
              </button>
            ),
          )}
        </nav>
      ) : null}
    </section>
  );
}
