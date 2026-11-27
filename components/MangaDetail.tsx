"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useChapters, type Chapter } from "@/lib/manga/client";
import { getLists, isFavorite, setListStatus, STORAGE_EVENT, toggleFavorite, type ListEntry, type SavedAnime } from "@/lib/storage";
import type { ListStatus } from "@/lib/state";
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

function when(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const RANGE = 100;
const PER_PAGE = 24;

/** Which block of 100 a chapter number falls in (1–100 → 0, 101–200 → 1…). */
const rangeOf = (number: string) => Math.max(0, Math.floor((Math.floor(parseFloat(number) || 0) - 1) / RANGE));

/** All readable chapters: a range dropdown (Ch. 1–100…), pages of 24, a number search and sort. */
export function ChapterList({ mangaId }: { mangaId: number }) {
  const { chapters, error } = useChapters(mangaId);
  const { entry } = useEntry(mangaId);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"desc" | "asc" | "date">("desc");
  const [range, setRange] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const top = useRef<HTMLElement>(null);
  const progress = entry?.progress ?? 0;

  // Ranges that have chapters, e.g. [{ id: 2, label: "Ch. 201–300" }].
  const ranges = useMemo(() => {
    const byRange = new Map<number, number[]>();
    for (const c of chapters ?? []) {
      const r = rangeOf(c.number);
      byRange.set(r, [...(byRange.get(r) ?? []), parseFloat(c.number) || 0]);
    }
    const list = [...byRange.entries()].map(([id, nums]) => ({
      id,
      label: `Ch. ${Math.floor(Math.min(...nums))}–${Math.floor(Math.max(...nums))}`,
    }));
    list.sort((a, b) => a.id - b.id);
    return sort === "asc" ? list : list.reverse();
  }, [chapters, sort]);

  // Open on the range with your next chapter, or the newest one.
  useEffect(() => {
    if (!chapters?.length || range !== null) return;
    const next = chapters.find((c) => parseFloat(c.number) > progress);
    setRange(rangeOf((next ?? chapters[chapters.length - 1]).number));
  }, [chapters, progress, range]);

  const term = q.trim();
  // Searching or sorting by date looks through every chapter; otherwise just the chosen range.
  const useRanges = !term && sort !== "date" && ranges.length > 1;
  const shown = useMemo(() => {
    let list = [...(chapters ?? [])];
    if (sort === "desc") list.reverse();
    if (sort === "date") list.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
    if (term) list = list.filter((c) => c.number.startsWith(term) || c.title?.toLowerCase().includes(term.toLowerCase()));
    else if (useRanges && range !== null) list = list.filter((c) => rangeOf(c.number) === range);
    return list;
  }, [chapters, sort, term, useRanges, range]);

  const pages = Math.max(1, Math.ceil(shown.length / PER_PAGE));
  const current = Math.min(page, pages - 1);
  const visible = shown.slice(current * PER_PAGE, current * PER_PAGE + PER_PAGE);

  // Start from page 1 of whatever you switch to; open the page with your next chapter in a range.
  useEffect(() => {
    if (!useRanges || term) return setPage(0);
    // Your next chapter is the lowest number above your progress, wherever the sort puts it.
    const ahead = shown.filter((c) => parseFloat(c.number) > progress);
    const next = ahead.reduce<Chapter | null>((m, c) => (!m || parseFloat(c.number) < parseFloat(m.number) ? c : m), null);
    const i = progress && next ? shown.indexOf(next) : 0;
    setPage(i > 0 ? Math.floor(i / PER_PAGE) : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, sort, term, useRanges]);

  const goPage = (p: number) => {
    setPage(p);
    // Keep the list in view when the new page is shorter.
    const el = top.current;
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const pager =
    pages > 1 ? (
      <div className="pager-pill">
        <button disabled={current === 0} onClick={() => goPage(current - 1)} aria-label="Previous page">
          <Icon name="prev" size={14} />
        </button>
        <span>
          {current + 1} / {pages}
        </span>
        <button disabled={current >= pages - 1} onClick={() => goPage(current + 1)} aria-label="Next page">
          <Icon name="next" size={14} />
        </button>
      </div>
    ) : null;

  return (
    <section className="chapters" ref={top}>
      <div className="chapters__head">
        <h2>
          Chapters <span>{chapters?.length ?? ""}</span>
        </h2>
        <div className="chapters__tools">
          <input
            className="chapters__search"
            placeholder="Find chapter"
            inputMode="decimal"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {useRanges ? (
            <select className="select chapters__range" value={range ?? ""} onChange={(e) => setRange(Number(e.target.value))} aria-label="Chapter range">
              {ranges.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          ) : null}
          <span className="chapters__lang">EN</span>
          <div className="mtabs">
            <button className={sort !== "date" ? "is-active" : ""} onClick={() => setSort(sort === "desc" ? "asc" : "desc")}>
              Chapter {sort === "asc" ? "↑" : "↓"}
            </button>
            <button className={sort === "date" ? "is-active" : ""} onClick={() => setSort("date")}>
              Date
            </button>
          </div>
        </div>
      </div>

      {chapters === null ? (
        <div className="chapters__list">
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className="chapter chapter--skeleton" />
          ))}
        </div>
      ) : chapters.length === 0 ? (
        <p className="empty">
          {error ? "Couldn't load chapters right now. Try again in a bit." : "No chapters available to read on Mayoi yet."}
        </p>
      ) : shown.length === 0 ? (
        <p className="empty">No chapter matches “{q}”.</p>
      ) : (
        <>
          {(() => {
            const last = Math.floor(parseFloat(chapters[chapters.length - 1].number));
            const missing = last - chapters.filter((c) => Number.isInteger(parseFloat(c.number)) && parseFloat(c.number) >= 1).length;
            return missing > 0 ? (
              <p className="mgap chapters__gap">
                Mayoi has {chapters.length} of {last}+ chapters for this one. The rest aren&apos;t available in English yet.
              </p>
            ) : null;
          })()}
          <div className="chapters__list">
            {visible.map((c) => {
              const read = parseFloat(c.number) <= progress;
              return (
                <Link key={c.id} href={`/manga/${mangaId}/read/${c.id}`} className={`chapter ${read ? "is-read" : ""}`}>
                  <span className="chapter__num">Chapter {c.number}</span>
                  <span className="chapter__title">{c.title ?? ""}</span>
                  <span className="chapter__meta">
                    {c.group ? <span>{c.group}</span> : null}
                    <span>{when(c.publishedAt)}</span>
                  </span>
                </Link>
              );
            })}
          </div>
          {pager ? (
            <div className="chapters__foot">
              <span className="muted">
                {current * PER_PAGE + 1}–{Math.min(shown.length, (current + 1) * PER_PAGE)} of {shown.length}
              </span>
              {pager}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
