"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_READER_PREFS, getReaderPrefs, saveReaderPrefs, useChapters, type Chapter, type ReaderPrefs } from "@/lib/manga/client";
import { perfTier } from "@/lib/device";
import { getLists, markChapterRead, type SavedAnime } from "@/lib/storage";
import { Icon } from "./Menu";

type Pages = { pages: string[]; saver?: string[]; number: string | null; group?: string | null };
type Panel = "chapters" | "settings" | "help" | null;

const CHAPTERS_PER_PAGE = 50;

// Page lists by chapter id, so a chapter fetched ahead of time opens straight away.
// MangaDex image links expire after ~15 minutes, so entries are kept for 10.
const pagesCache = new Map<string, { at: number; data: Promise<Pages> }>();
function loadPages(chapterId: string): Promise<Pages> {
  const hit = pagesCache.get(chapterId);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.data;
  const data = fetch(`/api/manga/pages?chapter=${chapterId}`).then((r) => (r.ok ? (r.json() as Promise<Pages>) : Promise.reject()));
  data.catch(() => pagesCache.delete(chapterId));
  pagesCache.set(chapterId, { at: Date.now(), data });
  return data;
}

// MangaKatana pages come through our image proxy. If it fails, try the image directly.
const PROXY = "/api/manga/image?u=";
function fallBackToDirect(img: HTMLImageElement, src: string): boolean {
  if (!src.startsWith(PROXY) || img.dataset.direct) return false;
  img.dataset.direct = "1";
  img.src = decodeURIComponent(src.slice(PROXY.length));
  return true;
}

// Two taps this close together, in time and on screen, count as a double tap.
const DOUBLE_TAP_MS = 280;
const DOUBLE_TAP_PX = 40;

function ago(iso: string | null) {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)}d ago`;
  if (s < 86400 * 365) return `${Math.round(s / (86400 * 30))}mo ago`;
  return `${Math.round(s / (86400 * 365))}y ago`;
}

/** Full-screen chapter reader: single page, double page or long strip, with a chapter pill and side toolbar. */
export default function Reader({ manga, chapterId }: { manga: SavedAnime; chapterId: string }) {
  const router = useRouter();
  const { chapters } = useChapters(manga.id);
  const [data, setData] = useState<Pages | null>(null);
  const [failed, setFailed] = useState(false);
  const [prefs, setPrefsState] = useState<ReaderPrefs>(DEFAULT_READER_PREFS);
  const [panel, setPanel] = useState<Panel>(null);
  const [page, setPage] = useState(0);
  const [chrome, setChrome] = useState(true);
  const [progress, setProgress] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);
  const marked = useRef(false);

  useEffect(() => setPrefsState(getReaderPrefs()), []);
  useEffect(() => setProgress(getLists()[manga.id]?.progress ?? 0), [manga.id, chapterId]);
  const setPrefs = (p: Partial<ReaderPrefs>) => {
    const next = { ...prefs, ...p };
    setPrefsState(next);
    saveReaderPrefs(next);
  };

  // Page images for this chapter.
  useEffect(() => {
    let live = true;
    setData(null);
    setFailed(false);
    setPage(0);
    marked.current = false;
    window.scrollTo(0, 0);
    loadPages(chapterId)
      .then((d) => live && setData(d))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [chapterId]);

  // Where this chapter sits in the list. A chapter opened from "Latest updates" may be
  // another group's upload of the same number, so match by number too.
  const list = chapters ?? [];
  let index = list.findIndex((c) => c.id === chapterId);
  if (index < 0 && data?.number) index = list.findIndex((c) => c.number === data.number);
  const current = index >= 0 ? list[index] : null;
  const number = current?.number ?? data?.number ?? "?";
  const prev = index > 0 ? list[index - 1] : null;
  const next = index >= 0 && index < list.length - 1 ? list[index + 1] : null;
  const go = (c: { id: string } | null) => c && router.push(`/manga/${manga.id}/read/${c.id}`);

  const images = data ? (prefs.saver && data.saver?.length ? data.saver : data.pages) : [];
  // The strip downloads pages in reading order, starting the next as each one finishes, so
  // pages are ready before you reach them (some sources take seconds per image). Proxied
  // pages come from our own server, which can take a whole chapter at once; fewer at once
  // on low-memory phones.
  const [lowEnd, setLowEnd] = useState(false);
  useEffect(() => setLowEnd(perfTier() === "low"), []);
  const proxied = !!images[0]?.startsWith(PROXY);
  const parallel = proxied ? (lowEnd ? 4 : 24) : lowEnd ? 2 : 4;
  const [done, setDone] = useState(0);
  useEffect(() => setDone(0), [data, prefs.saver]);
  const strip = prefs.mode === "vertical";
  const step = prefs.mode === "double" ? 2 : 1;
  const lastPage = Math.max(0, images.length - 1);

  // Which page you're looking at in the strip (for the progress bar).
  const stripRef = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(0);
  useEffect(() => {
    if (!strip) return;
    const onScroll = () => {
      const imgs = stripRef.current?.querySelectorAll("img");
      if (!imgs?.length) return;
      let i = 0;
      imgs.forEach((img, n) => img.getBoundingClientRect().top < window.innerHeight / 2 && (i = n));
      setSeen(i);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [strip, data]);
  const at = strip ? seen : page;
  // Pages allowed to download: the next few after those finished, and never fewer than a
  // few past the one on screen, so jumping ahead gets what you're looking at first.
  const limit = Math.min(images.length, Math.max(done, seen) + parallel);

  // Near the end of a chapter, fetch the next one's page list and first images.
  const prefetched = useRef<string | null>(null);
  useEffect(() => {
    if (!data || !next || prefetched.current === next.id) return;
    const nearEnd = strip ? done >= images.length - 1 || seen >= images.length - 4 : page + step * 3 > lastPage;
    if (!nearEnd) return;
    prefetched.current = next.id;
    loadPages(next.id)
      .then((d) => {
        for (const src of (prefs.saver && d.saver?.length ? d.saver : d.pages).slice(0, 6)) {
          const img = new Image();
          img.referrerPolicy = "no-referrer";
          img.src = src;
        }
      })
      .catch(() => {});
  }, [data, next, strip, done, seen, page, step, lastPage, images.length, prefs.saver]);

  // Reaching the end of the chapter counts it as read.
  const markRead = () => {
    if (marked.current || number === "?") return;
    marked.current = true;
    markChapterRead({ ...manga, chapters: manga.chapters }, parseFloat(number));
  };
  useEffect(() => {
    if (!strip || !data || !endRef.current) return;
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && markRead(), { rootMargin: "200px" });
    io.observe(endRef.current);
    // Backup for browsers that skip the observer: near the bottom counts too.
    const onScroll = () => window.innerHeight + window.scrollY >= document.body.scrollHeight - 400 && markRead();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strip, data, number]);
  useEffect(() => {
    if (!strip && images.length && page + step > lastPage) markRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strip, page, images.length]);

  const turn = (dir: 1 | -1) => {
    if (dir > 0) page + step <= lastPage ? setPage(page + step) : go(next);
    else page > 0 ? setPage(Math.max(0, page - step)) : go(prev);
  };
  const jumpTo = (i: number) => {
    if (strip) stripRef.current?.querySelectorAll("img")[i]?.scrollIntoView({ behavior: "smooth", block: "start" });
    else setPage(prefs.mode === "double" ? i - (i % 2) : i);
  };

  // Keyboard: ← → pages (or chapters in the strip), ↑ ↓ / Space scroll the strip, Esc closes panels.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;
      if (e.key === "Escape") return setPanel(null);
      if (e.key === "ArrowRight" || e.key === "d") return strip ? go(next) : turn(1);
      if (e.key === "ArrowLeft" || e.key === "a") return strip ? go(prev) : turn(-1);
      if (e.key === "f") return fullscreen();
      if (e.key === "c") return setPanel((p) => (p === "chapters" ? null : "chapters"));
      if (e.key === "s") return setPanel((p) => (p === "settings" ? null : "settings"));
      if (strip && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === " ")) {
        e.preventDefault();
        const dir = e.key === "ArrowUp" || (e.key === " " && e.shiftKey) ? -1 : 1;
        window.scrollBy({ top: (dir * window.innerHeight * prefs.scrollAmount) / 100, behavior: prefs.keyScroll === "smooth" ? "smooth" : "auto" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Hide the controls while scrolling down, show them again on scroll up.
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - last) > 30) {
        setChrome(y < last || y < 80);
        last = y;
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Fullscreen isn't available on iPhone, so the button only shows where it works.
  const [canFullscreen, setCanFullscreen] = useState(false);
  useEffect(() => setCanFullscreen(!!document.fullscreenEnabled), []);
  function fullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  }

  // Single / double page on phones: swipe left for the next page, right for the previous one.
  const touch = useRef<{ x: number; y: number } | null>(null);

  // Double-tap anywhere on the pages shows (or hides) the top bar, chapter pill and toolbar.
  // A tap on a single / double page turns it, so on touch screens that turn waits a moment
  // in case a second tap follows.
  const tapStart = useRef<{ x: number; y: number; t: number } | null>(null);
  const lastTap = useRef<{ x: number; y: number; t: number } | null>(null);
  const lastTouchEnd = useRef(0);
  const pendingTurn = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (pendingTurn.current && clearTimeout(pendingTurn.current)), []);
  const onPagesTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    tapStart.current = e.touches.length === 1 ? { x: t.clientX, y: t.clientY, t: Date.now() } : null;
  };
  const onPagesTouchEnd = (e: React.TouchEvent) => {
    lastTouchEnd.current = Date.now();
    const start = tapStart.current;
    tapStart.current = null;
    const t = e.changedTouches[0];
    // Only quick taps that stay put count; swipes, scrolls and pinches don't.
    if (!start || e.touches.length || Math.hypot(t.clientX - start.x, t.clientY - start.y) > 15 || Date.now() - start.t > 300) return;
    const prev = lastTap.current;
    const tap = { x: t.clientX, y: t.clientY, t: Date.now() };
    if (prev && tap.t - prev.t < DOUBLE_TAP_MS && Math.hypot(tap.x - prev.x, tap.y - prev.y) < DOUBLE_TAP_PX) {
      e.preventDefault(); // no click (or zoom) from the second tap
      if (pendingTurn.current) clearTimeout(pendingTurn.current);
      pendingTurn.current = null;
      lastTap.current = null;
      setChrome((c) => !c);
    } else {
      lastTap.current = tap;
    }
  };
  const tapTurn = (dir: 1 | -1) => {
    if (Date.now() - lastTouchEnd.current > 600) return turn(dir); // mouse: turn right away
    if (pendingTurn.current) clearTimeout(pendingTurn.current);
    pendingTurn.current = setTimeout(() => {
      pendingTurn.current = null;
      turn(dir);
    }, DOUBLE_TAP_MS);
  };

  const toggle = (p: Panel) => setPanel(panel === p ? null : p);
  const classes = [
    "reader",
    `reader--${prefs.mode}`,
    prefs.fitWidth ? "fit-w" : "",
    prefs.fitHeight ? "fit-h" : "",
    prefs.stretch ? "stretch" : "",
    prefs.fitWidth && prefs.limitWidth ? "limit-w" : "",
    prefs.fitHeight && prefs.limitHeight ? "limit-h" : "",
    prefs.grayscale ? "gray" : "",
    chrome ? "" : "is-hidden",
  ].join(" ");

  return (
    <div className={classes} style={{ "--page-gap": `${prefs.margin}px` } as React.CSSProperties}>
      <header className="reader__top">
        <Link href={`/manga/${manga.id}`} className="reader__back" aria-label="Back to manga">
          <Icon name="prev" size={18} />
        </Link>
        <div className="reader__name">
          <strong>{manga.title}</strong>
          <span>
            Chapter {number}
            {current?.title ? ` · ${current.title}` : ""}
          </span>
        </div>
      </header>

      <main className="reader__pages" onClick={() => setPanel(null)} onTouchStart={onPagesTouchStart} onTouchEnd={onPagesTouchEnd}>
        {failed ? (
          <div className="reader__msg">
            <p>Couldn&apos;t load this chapter.</p>
            <Link href={`/manga/${manga.id}`} className="btn">
              Back to chapters
            </Link>
          </div>
        ) : !data ? (
          <div className="reader__msg">
            <span className="spinner" />
          </div>
        ) : strip ? (
          <div className="reader__strip" ref={stripRef}>
            {images.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={src}
                src={i < limit ? src : undefined}
                alt={`Page ${i + 1}`}
                decoding="async"
                referrerPolicy="no-referrer"
                onLoad={(e) => (e.currentTarget.classList.add("is-loaded"), setDone((n) => n + 1))}
                onError={(e) => fallBackToDirect(e.currentTarget, src) || setDone((n) => n + 1)}
              />
            ))}
          </div>
        ) : (
          <div
            className="reader__page"
            onClick={(e) => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              tapTurn(e.clientX - r.left > r.width / 2 ? 1 : -1);
            }}
            onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
            onTouchEnd={(e) => {
              const start = touch.current;
              touch.current = null;
              if (!start || e.touches.length) return;
              const dx = e.changedTouches[0].clientX - start.x;
              const dy = e.changedTouches[0].clientY - start.y;
              if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
                e.preventDefault(); // don't also count it as a tap
                turn(dx < 0 ? 1 : -1);
              }
            }}
          >
            {images.slice(page, page + step).map((src) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={src} src={src} alt={`Page ${page + 1}`} referrerPolicy="no-referrer" onError={(e) => fallBackToDirect(e.currentTarget, src)} />
            ))}
            {/* Preload the next few pages. */}
            {images.slice(page + step, page + step + 3).map((src) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={`pre-${src}`} src={src} alt="" referrerPolicy="no-referrer" className="reader__preload" />
            ))}
          </div>
        )}

        {data ? (
          <div className="reader__end" ref={endRef}>
            {data.group ? <p className="muted">Scanlated by {data.group}</p> : null}
            <div className="reader__endnav">
              {prev ? (
                <button className="btn" onClick={() => go(prev)}>
                  <Icon name="prev" size={14} /> Ch. {prev.number}
                </button>
              ) : null}
              {next ? (
                <button className="btn btn--primary" onClick={() => go(next)}>
                  Next: Ch. {next.number} <Icon name="next" size={14} />
                </button>
              ) : (
                <Link href={`/manga/${manga.id}`} className="btn">
                  {chapters ? "You're caught up · Back to manga" : "Back to manga"}
                </Link>
              )}
            </div>
          </div>
        ) : null}
      </main>

      {/* Darken the pages (under the controls) */}
      {prefs.dim > 0 ? <div className="reader__dim" style={{ opacity: prefs.dim / 100 }} /> : null}

      {/* Page progress: one segment per page, click to jump */}
      {prefs.progressBar !== "none" && images.length > 1 ? (
        <div className={`reader__progress reader__progress--${prefs.progressBar}`}>
          {images.map((_, i) => (
            <button
              key={i}
              className={i <= at + (strip ? 0 : step - 1) ? "is-done" : ""}
              onClick={() => jumpTo(i)}
              aria-label={`Page ${i + 1}`}
              title={`Page ${i + 1}`}
            />
          ))}
        </div>
      ) : null}

      {/* Chapter pill */}
      <div className="reader__pill">
        <button disabled={!prev} onClick={() => go(prev)} aria-label="Previous chapter">
          <Icon name="prev" size={16} />
        </button>
        <button className="reader__pillmid" onClick={() => toggle("chapters")}>
          Ch. {number}
          {list.length ? ` / ${list[list.length - 1].number}` : ""}
          {!strip && images.length ? <em> · {page + 1}/{images.length}</em> : null}
        </button>
        <button disabled={!next} onClick={() => go(next)} aria-label="Next chapter">
          <Icon name="next" size={16} />
        </button>
      </div>

      {/* Side toolbar */}
      <nav className="reader__tools">
        <Link href="/manga" title="Manga home" aria-label="Manga home">
          <Icon name="home" size={18} />
        </Link>
        <Link href={`/manga/${manga.id}`} title="Manga info" aria-label="Manga info">
          <Icon name="book" size={18} />
        </Link>
        <button title="Chapters (C)" aria-label="Chapters" className={panel === "chapters" ? "is-active" : ""} onClick={() => toggle("chapters")}>
          <Icon name="list" size={18} />
        </button>
        <button title="Settings (S)" aria-label="Reader settings" className={panel === "settings" ? "is-active" : ""} onClick={() => toggle("settings")}>
          <Icon name="gear" size={18} />
        </button>
        <button
          title={`Layout: ${prefs.mode === "vertical" ? "Long strip" : prefs.mode === "double" ? "Double" : "Single"}`}
          aria-label="Change layout"
          onClick={() => setPrefs({ mode: prefs.mode === "single" ? "double" : prefs.mode === "double" ? "vertical" : "single" })}
        >
          <Icon name={prefs.mode === "vertical" ? "strip" : prefs.mode} size={18} />
        </button>
        {canFullscreen ? (
          <button title="Fullscreen (F)" aria-label="Fullscreen" onClick={fullscreen}>
            <Icon name="expand" size={18} />
          </button>
        ) : null}
        <button title="Help" aria-label="Help" className={panel === "help" ? "is-active" : ""} onClick={() => toggle("help")}>
          <Icon name="help" size={18} />
        </button>
      </nav>

      {panel === "chapters" ? (
        <ChapterPanel
          mangaId={manga.id}
          chapters={list}
          currentId={current?.id ?? null}
          progress={progress}
          onClose={() => setPanel(null)}
        />
      ) : null}
      {panel === "settings" ? <SettingsPanel prefs={prefs} setPrefs={setPrefs} onClose={() => setPanel(null)} /> : null}
      {panel === "help" ? <HelpPanel onClose={() => setPanel(null)} /> : null}
    </div>
  );
}

function PanelHead({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="rpanel__head">
      {children}
      <button className="rpanel__close" onClick={onClose} aria-label="Close">
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}

/** Chapter list: search, sort by chapter or date, pages of 50 with numbers. */
function ChapterPanel({
  mangaId,
  chapters,
  currentId,
  progress,
  onClose,
}: {
  mangaId: number;
  chapters: Chapter[];
  currentId: string | null;
  progress: number;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"desc" | "asc" | "date">("desc");
  const shown = useMemo(() => {
    let list = [...chapters];
    if (sort === "desc") list.reverse();
    if (sort === "date") list.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
    const term = q.trim().toLowerCase();
    if (term) list = list.filter((c) => c.number.startsWith(term) || c.title?.toLowerCase().includes(term));
    return list;
  }, [chapters, sort, q]);
  const pages = Math.max(1, Math.ceil(shown.length / CHAPTERS_PER_PAGE));

  // Open on the page with the chapter you're reading.
  const [page, setPage] = useState(0);
  useEffect(() => {
    const i = shown.findIndex((c) => c.id === currentId);
    setPage(!q && i > 0 ? Math.floor(i / CHAPTERS_PER_PAGE) : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, q]);
  const cur = Math.min(page, pages - 1);
  const visible = shown.slice(cur * CHAPTERS_PER_PAGE, (cur + 1) * CHAPTERS_PER_PAGE);

  // Page numbers around the current one, like « ‹ 9 10 11 12 13 › ».
  const nums = Array.from({ length: pages }, (_, i) => i).filter((i) => Math.abs(i - cur) <= 2 || (cur < 2 && i < 5) || (cur > pages - 3 && i >= pages - 5));

  return (
    <aside className="rpanel rpanel--chapters">
      <PanelHead onClose={onClose}>
        <strong>Chapters</strong>
      </PanelHead>
      <label className="rpanel__search">
        <Icon name="search" size={15} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chapter number or title" autoFocus />
      </label>
      <div className="rpanel__seg">
        <button className={sort !== "date" ? "is-active" : ""} onClick={() => setSort(sort === "desc" ? "asc" : "desc")}>
          Chapter {sort === "asc" ? "↑" : "↓"}
        </button>
        <button className={sort === "date" ? "is-active" : ""} onClick={() => setSort("date")}>
          Date
        </button>
      </div>
      <div className="rpanel__list">
        {visible.length === 0 ? <p className="muted rpanel__empty">No chapter matches.</p> : null}
        {visible.map((c) => {
          const active = c.id === currentId;
          const read = parseFloat(c.number) <= progress;
          return (
            <Link
              key={c.id}
              href={`/manga/${mangaId}/read/${c.id}`}
              className={`rchap ${active ? "is-active" : ""}`}
              onClick={onClose}
              ref={active ? (el) => el?.scrollIntoView({ block: "center" }) : undefined}
            >
              <span className="rchap__num">Ch. {c.number}</span>
              {read ? (
                <span className="rchap__read" title="Read">
                  <Icon name="check" size={12} />
                </span>
              ) : null}
              <span className="rchap__title">{c.title ?? ""}</span>
              <span className="rchap__when">{ago(c.publishedAt)}</span>
            </Link>
          );
        })}
      </div>
      {pages > 1 ? (
        <div className="rpanel__pages">
          <button disabled={cur === 0} onClick={() => setPage(0)} aria-label="First page">
            «
          </button>
          <button disabled={cur === 0} onClick={() => setPage(cur - 1)} aria-label="Previous page">
            ‹
          </button>
          {nums.map((i) => (
            <button key={i} className={i === cur ? "is-active" : ""} onClick={() => setPage(i)}>
              {i + 1}
            </button>
          ))}
          <button disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} aria-label="Next page">
            ›
          </button>
          <button disabled={cur >= pages - 1} onClick={() => setPage(pages - 1)} aria-label="Last page">
            »
          </button>
        </div>
      ) : null}
    </aside>
  );
}

function Stepper({ value, onChange, min, max, step, unit, reset }: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  unit: string;
  reset: number;
}) {
  return (
    <div className="rstep">
      <div className="rstep__box">
        <button onClick={() => onChange(Math.max(min, value - step))} disabled={value <= min} aria-label="Less">
          <Icon name="minus" size={14} />
        </button>
        <span>
          {value}
          {unit}
        </span>
        <button onClick={() => onChange(Math.min(max, value + step))} disabled={value >= max} aria-label="More">
          <Icon name="plus" size={14} />
        </button>
      </div>
      <button className="rstep__reset" onClick={() => onChange(reset)} disabled={value === reset}>
        Reset
      </button>
    </div>
  );
}

function Check({ checked, disabled, onChange, children }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className={`rcheck ${disabled ? "is-disabled" : ""}`}>
      <input type="checkbox" checked={checked && !disabled} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

/** Reader settings, in two tabs like the layout / image split most readers use. */
function SettingsPanel({ prefs, setPrefs, onClose }: { prefs: ReaderPrefs; setPrefs: (p: Partial<ReaderPrefs>) => void; onClose: () => void }) {
  const [tab, setTab] = useState<"layout" | "image">("layout");
  const d = DEFAULT_READER_PREFS;
  return (
    <aside className="rpanel rpanel--settings">
      <PanelHead onClose={onClose}>
        <div className="rpanel__tabs">
          <button className={tab === "layout" ? "is-active" : ""} onClick={() => setTab("layout")}>
            Layout
          </button>
          <button className={tab === "image" ? "is-active" : ""} onClick={() => setTab("image")}>
            Image
          </button>
        </div>
      </PanelHead>

      {tab === "layout" ? (
        <div className="rpanel__body">
          <h4>Layout</h4>
          <div className="rtiles">
            {(
              [
                ["single", "Single", "single"],
                ["double", "Double", "double"],
                ["vertical", "Long strip", "strip"],
              ] as const
            ).map(([mode, label, icon]) => (
              <button key={mode} className={prefs.mode === mode ? "is-active" : ""} onClick={() => setPrefs({ mode })}>
                <Icon name={icon} size={20} />
                {label}
              </button>
            ))}
          </div>

          <h4>Margin</h4>
          <Stepper value={prefs.margin} onChange={(margin) => setPrefs({ margin })} min={0} max={60} step={5} unit="px" reset={d.margin} />

          <h4>Keyboard scrolling</h4>
          <div className="rtiles rtiles--two">
            <button className={prefs.keyScroll === "fast" ? "is-active" : ""} onClick={() => setPrefs({ keyScroll: "fast" })}>
              Scroll fast
            </button>
            <button className={prefs.keyScroll === "smooth" ? "is-active" : ""} onClick={() => setPrefs({ keyScroll: "smooth" })}>
              Scroll smooth
            </button>
          </div>

          <h4>Scroll amount</h4>
          <Stepper
            value={prefs.scrollAmount}
            onChange={(scrollAmount) => setPrefs({ scrollAmount })}
            min={10}
            max={100}
            step={10}
            unit="%"
            reset={d.scrollAmount}
          />

          <h4>Progress bar</h4>
          <div className="rtiles rtiles--five">
            {(["left", "top", "right", "bottom", "none"] as const).map((pos) => (
              <button
                key={pos}
                className={prefs.progressBar === pos ? "is-active" : ""}
                onClick={() => setPrefs({ progressBar: pos })}
                title={pos === "none" ? "Hidden" : `${pos[0].toUpperCase()}${pos.slice(1)}`}
                aria-label={pos === "none" ? "No progress bar" : `Progress bar on the ${pos}`}
              >
                {pos === "none" ? <Icon name="close" size={16} /> : <span className={`rbar rbar--${pos}`} />}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="rpanel__body">
          <h4>Image sizing</h4>
          <Check checked={prefs.fitWidth} onChange={(fitWidth) => setPrefs({ fitWidth })}>
            Fit width
          </Check>
          <Check checked={prefs.fitHeight} onChange={(fitHeight) => setPrefs({ fitHeight })}>
            Fit height
          </Check>
          <Check checked={prefs.stretch} onChange={(stretch) => setPrefs({ stretch })}>
            Stretch small images
          </Check>
          <Check checked={prefs.limitWidth} disabled={!prefs.fitWidth} onChange={(limitWidth) => setPrefs({ limitWidth })}>
            Limit max width
          </Check>
          <Check checked={prefs.limitHeight} disabled={!prefs.fitHeight} onChange={(limitHeight) => setPrefs({ limitHeight })}>
            Limit max height
          </Check>

          <h4>Image coloring</h4>
          <Check checked={prefs.grayscale} onChange={(grayscale) => setPrefs({ grayscale })}>
            Grayscale
          </Check>
          <Check checked={prefs.saver} onChange={(saver) => setPrefs({ saver })}>
            Data saver (smaller images)
          </Check>

          <div className="rpanel__row">
            <h4>Dim screen</h4>
            <span className="rpanel__val">{prefs.dim}%</span>
          </div>
          <input
            className="rrange"
            type="range"
            min={0}
            max={80}
            step={5}
            value={prefs.dim}
            onChange={(e) => setPrefs({ dim: Number(e.target.value) })}
            style={{ "--fill": `${(prefs.dim / 80) * 100}%` } as React.CSSProperties}
          />
        </div>
      )}
    </aside>
  );
}

function HelpPanel({ onClose }: { onClose: () => void }) {
  const keys: [string, string][] = [
    ["← / A", "Previous page (or chapter in long strip)"],
    ["→ / D", "Next page (or chapter in long strip)"],
    ["↑ ↓ / Space", "Scroll the long strip"],
    ["C", "Chapter list"],
    ["S", "Settings"],
    ["F", "Fullscreen"],
    ["Esc", "Close this panel"],
  ];
  return (
    <aside className="rpanel rpanel--help">
      <PanelHead onClose={onClose}>
        <strong>Shortcuts</strong>
      </PanelHead>
      <div className="rpanel__body">
        {keys.map(([k, what]) => (
          <div key={k} className="rkey">
            <kbd>{k}</kbd>
            <span>{what}</span>
          </div>
        ))}
        <p className="muted rpanel__note">
          On phones, tap the left or right side of a page (or swipe) to turn it. Double-tap to show or hide the controls.
        </p>
      </div>
    </aside>
  );
}
