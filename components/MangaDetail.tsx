"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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

/** The chapter to open next: the one after your progress, or the first. */
function nextChapter(chapters: Chapter[], progress: number) {
  if (!progress) return { chapter: chapters[0], continuing: false };
  const next = chapters.find((c) => parseFloat(c.number) > progress);
  return { chapter: next ?? chapters[chapters.length - 1], continuing: true };
}

/** Continue / Start reading, list status and favourite. */
export function MangaActions({ manga }: { manga: SavedAnime }) {
  const { chapters } = useChapters(manga.id);
  const { entry, fav, setFav } = useEntry(manga.id);
  const saved: SavedAnime = { ...manga, type: "MANGA" };
  const status = STATUSES.find((s) => s.id === entry?.status);
  const target = chapters?.length ? nextChapter(chapters, entry?.progress ?? 0) : null;

  return (
    <div className="hero__actions">
      {chapters === null ? (
        <span className="btn btn--primary btn--disabled">Loading chapters…</span>
      ) : target ? (
        <Link href={`/manga/${manga.id}/read/${target.chapter.id}`} className="btn btn--primary">
          <Icon name="play" size={15} /> {target.continuing ? "Continue" : "Start reading"} · Ch. {target.chapter.number}
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

/** All readable chapters, with a number search and sort. */
export function ChapterList({ mangaId }: { mangaId: number }) {
  const { chapters, error } = useChapters(mangaId);
  const { entry } = useEntry(mangaId);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"desc" | "asc" | "date">("desc");
  const [limit, setLimit] = useState(100);

  const shown = useMemo(() => {
    let list = [...(chapters ?? [])];
    if (sort === "desc") list.reverse();
    if (sort === "date") list.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
    const term = q.trim();
    if (term) list = list.filter((c) => c.number.startsWith(term) || c.title?.toLowerCase().includes(term.toLowerCase()));
    return list;
  }, [chapters, sort, q]);

  const progress = entry?.progress ?? 0;

  return (
    <section className="chapters">
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
            onChange={(e) => (setQ(e.target.value), setLimit(100))}
          />
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
          <div className="chapters__list">
            {shown.slice(0, limit).map((c) => {
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
          {shown.length > limit ? (
            <button className="btn btn--sm chapters__more" onClick={() => setLimit(limit + 200)}>
              Show more ({shown.length - limit} left)
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
