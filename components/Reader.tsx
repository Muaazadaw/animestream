"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getReaderPrefs, saveReaderPrefs, useChapters, type ReaderPrefs } from "@/lib/manga/client";
import { getLists, markChapterRead, type SavedAnime } from "@/lib/storage";
import { Icon } from "./Menu";

type Pages = { pages: string[]; saver: string[]; number: string | null; group: string | null };

/** Full-screen chapter reader: long strip or page by page, with a chapter pill and side toolbar. */
export default function Reader({ manga, chapterId }: { manga: SavedAnime; chapterId: string }) {
  const router = useRouter();
  const { chapters } = useChapters(manga.id);
  const [data, setData] = useState<Pages | null>(null);
  const [failed, setFailed] = useState(false);
  const [prefs, setPrefsState] = useState<ReaderPrefs>({ mode: "vertical", saver: false, fit: "comfy", gap: false });
  const [panel, setPanel] = useState<"chapters" | "settings" | null>(null);
  const [page, setPage] = useState(0);
  const [chrome, setChrome] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);
  const marked = useRef(false);

  const [progress, setProgress] = useState(0);
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
    fetch(`/api/manga/pages?chapter=${chapterId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Pages) => live && setData(d))
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

  const images = data ? (prefs.saver ? data.saver : data.pages) : [];
  const paged = prefs.mode === "paged";

  // Reaching the end of the chapter counts it as read.
  const markRead = () => {
    if (marked.current || number === "?") return;
    marked.current = true;
    markChapterRead({ ...manga, chapters: manga.chapters }, parseFloat(number));
  };
  useEffect(() => {
    if (paged || !data || !endRef.current) return;
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
  }, [paged, data, number]);
  useEffect(() => {
    if (paged && images.length && page === images.length - 1) markRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paged, page, images.length]);

  // Keyboard: ←/→ turn pages (or chapters in the strip), Esc closes panels.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT")) return;
      if (e.key === "Escape") setPanel(null);
      else if (e.key === "ArrowRight" || e.key === "d") {
        if (paged && page < images.length - 1) setPage(page + 1);
        else go(next);
      } else if (e.key === "ArrowLeft" || e.key === "a") {
        if (paged && page > 0) setPage(page - 1);
        else if (!paged || page === 0) go(prev);
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

  // Paged mode on phones: swipe left for the next page, right for the previous one.
  const touch = useRef<{ x: number; y: number } | null>(null);
  const turn = (dir: 1 | -1) => {
    if (dir > 0) page < images.length - 1 ? setPage(page + 1) : go(next);
    else page > 0 ? setPage(page - 1) : go(prev);
  };

  const fullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  };


  return (
    <div className={`reader reader--${prefs.mode} reader--${prefs.fit} ${prefs.gap ? "reader--gap" : ""} ${chrome ? "" : "is-hidden"}`}>
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

      <main className="reader__pages" onClick={() => setPanel(null)}>
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
        ) : paged ? (
          <div
            className="reader__page"
            onClick={(e) => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              turn(e.clientX - r.left > r.width / 2 ? 1 : -1);
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={images[page]} alt={`Page ${page + 1}`} referrerPolicy="no-referrer" />
            {/* Preload the next page. */}
            {images[page + 1] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={images[page + 1]} alt="" referrerPolicy="no-referrer" className="reader__preload" />
            ) : null}
          </div>
        ) : (
          images.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt={`Page ${i + 1}`} loading={i < 3 ? "eager" : "lazy"} referrerPolicy="no-referrer" />
          ))
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

      {/* Chapter pill */}
      <div className="reader__pill">
        <button disabled={!prev} onClick={() => go(prev)} aria-label="Previous chapter">
          <Icon name="prev" size={16} />
        </button>
        <button className="reader__pillmid" onClick={() => setPanel(panel === "chapters" ? null : "chapters")}>
          Ch. {number}
          {list.length ? ` / ${list[list.length - 1].number}` : ""}
          {paged && images.length ? <em> · {page + 1}/{images.length}</em> : null}
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
          <Icon name="info" size={18} />
        </Link>
        <button title="Chapters" aria-label="Chapters" className={panel === "chapters" ? "is-active" : ""} onClick={() => setPanel(panel === "chapters" ? null : "chapters")}>
          <Icon name="list" size={18} />
        </button>
        <button title="Reader settings" aria-label="Reader settings" className={panel === "settings" ? "is-active" : ""} onClick={() => setPanel(panel === "settings" ? null : "settings")}>
          <Icon name="gear" size={18} />
        </button>
        <button
          title={paged ? "Long strip" : "Page by page"}
          aria-label={paged ? "Switch to long strip" : "Switch to page by page"}
          onClick={() => setPrefs({ mode: paged ? "vertical" : "paged" })}
        >
          <Icon name={paged ? "layers" : "image"} size={18} />
        </button>
        {canFullscreen ? (
          <button title="Fullscreen" aria-label="Fullscreen" onClick={fullscreen}>
            <Icon name="monitor" size={18} />
          </button>
        ) : null}
      </nav>

      {panel === "chapters" ? (
        <aside className="reader__panel">
          <div className="reader__panelhead">
            <strong>Chapters</strong>
            <button onClick={() => setPanel(null)} aria-label="Close">
              <Icon name="close" size={16} />
            </button>
          </div>
          <div className="reader__chapters">
            {[...list].reverse().map((c) => (
              <Link
                key={c.id}
                href={`/manga/${manga.id}/read/${c.id}`}
                className={`${c.id === current?.id ? "is-active" : ""} ${parseFloat(c.number) <= progress ? "is-read" : ""}`}
                onClick={() => setPanel(null)}
                ref={c.id === current?.id ? (el) => el?.scrollIntoView({ block: "center" }) : undefined}
              >
                <span>Chapter {c.number}</span>
                {c.title ? <em>{c.title}</em> : null}
              </Link>
            ))}
          </div>
        </aside>
      ) : null}

      {panel === "settings" ? (
        <aside className="reader__panel">
          <div className="reader__panelhead">
            <strong>Reader settings</strong>
            <button onClick={() => setPanel(null)} aria-label="Close">
              <Icon name="close" size={16} />
            </button>
          </div>
          <div className="reader__settings">
            <label>Reading mode</label>
            <div className="mtabs">
              <button className={!paged ? "is-active" : ""} onClick={() => setPrefs({ mode: "vertical" })}>
                Long strip
              </button>
              <button className={paged ? "is-active" : ""} onClick={() => setPrefs({ mode: "paged" })}>
                Page by page
              </button>
            </div>
            <label>Page width</label>
            <div className="mtabs">
              <button className={prefs.fit === "comfy" ? "is-active" : ""} onClick={() => setPrefs({ fit: "comfy" })}>
                Comfortable
              </button>
              <button className={prefs.fit === "width" ? "is-active" : ""} onClick={() => setPrefs({ fit: "width" })}>
                Full width
              </button>
            </div>
            <label className="reader__check">
              <input type="checkbox" checked={prefs.gap} onChange={(e) => setPrefs({ gap: e.target.checked })} /> Gap between pages
            </label>
            <label className="reader__check">
              <input type="checkbox" checked={prefs.saver} onChange={(e) => setPrefs({ saver: e.target.checked })} /> Data saver (smaller images)
            </label>
            <p className="muted reader__keys">Tap or swipe to turn pages · Keys: ← → change page or chapter</p>
          </div>
        </aside>
      ) : null}
    </div>
  );
}
