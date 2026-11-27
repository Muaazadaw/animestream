"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getLists, setListStatus, STORAGE_EVENT } from "@/lib/storage";
import { Icon } from "./Menu";

export type HeroItem = {
  id: number;
  title: string;
  banner: string;
  /** Transparent title logo, shown instead of the text title when available. */
  logo: string | null;
  cover: string | null;
  format: string | null;
  episodes: number | null;
  description: string;
  chips: string[];
  color: string | null;
};

const INTERVAL_MS = 7000;
/** Drag distance (px) or flick speed (px/ms) that counts as a swipe. */
const SWIPE_PX = 60;
const SWIPE_SPEED = 0.45;
/** Scroll distance over which the pinned banner fades out. */
const FADE_PX = 460;

export default function Hero({ items }: { items: HeroItem[] }) {
  const [i, setI] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [listed, setListed] = useState<Set<number>>(new Set());
  // Banners we've asked the browser for; the rest load as their turn comes up.
  const [seen, setSeen] = useState<Set<number>>(() => new Set([0, 1]));
  const start = useRef<{ x: number; y: number; t: number; id: number; horizontal: boolean | null } | null>(null);
  const moved = useRef(false);
  const ref = useRef<HTMLElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const count = items.length;
  const paused = hovered || dragging;

  function go(n: number) {
    setI(((n % count) + count) % count);
  }

  useEffect(() => {
    setSeen((s) => {
      const next = [(i + 1) % count, (i - 1 + count) % count].filter((n) => !s.has(n));
      if (s.has(i) && next.length === 0) return s;
      return new Set([...s, i, ...next]);
    });
  }, [i, count]);

  // Autoplay; restarts whenever the slide changes.
  useEffect(() => {
    if (paused || count < 2) return;
    const t = setTimeout(() => go(i + 1), INTERVAL_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, paused, count]);

  // The banner is pinned behind the page and fades out as you scroll past it.
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      if (bannerRef.current) bannerRef.current.style.opacity = String(Math.max(0, 1 - window.scrollY / FADE_PX));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  // Arrow keys while the hero is on screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const r = ref.current?.getBoundingClientRect();
      if (!r || r.bottom < 0 || r.top > window.innerHeight) return;
      if (e.key === "ArrowRight") go(i + 1);
      if (e.key === "ArrowLeft") go(i - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    const sync = () => setListed(new Set(Object.keys(getLists()).map(Number)));
    sync();
    window.addEventListener(STORAGE_EVENT, sync);
    return () => window.removeEventListener(STORAGE_EVENT, sync);
  }, []);

  if (count === 0) return null;
  const cur = items[i];
  const inList = listed.has(cur.id);

  // Dragging moves the text directly, without re-rendering on every pointer move.
  function setDragOffset(dx: number) {
    const el = contentRef.current;
    if (!el) return;
    const width = ref.current?.clientWidth ?? 1000;
    el.style.transform = dx ? `translateX(${dx * 0.6}px)` : "";
    el.style.opacity = dx ? String(1 - Math.min(1, Math.abs(dx) / width) * 1.4) : "";
  }

  function onPointerDown(e: React.PointerEvent) {
    if (count < 2 || (e.pointerType === "mouse" && e.button !== 0)) return;
    start.current = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, horizontal: null };
    moved.current = false;
  }

  function onPointerMove(e: React.PointerEvent) {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    // Decide once whether this gesture is a horizontal swipe or a vertical scroll.
    if (s.horizontal === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      s.horizontal = Math.abs(dx) > Math.abs(dy);
      if (!s.horizontal) {
        start.current = null;
        return;
      }
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setDragging(true);
    }
    moved.current = true;
    setDragOffset(dx);
  }

  function onPointerUp(e: React.PointerEvent) {
    const s = start.current;
    start.current = null;
    if (!s || !s.horizontal) return;
    const dx = e.clientX - s.x;
    const speed = Math.abs(dx) / Math.max(1, performance.now() - s.t);
    setDragging(false);
    setDragOffset(0);
    if (Math.abs(dx) > SWIPE_PX || speed > SWIPE_SPEED) go(dx < 0 ? i + 1 : i - 1);
  }

  return (
    <section
      ref={ref}
      className={`hero ${dragging ? "is-dragging" : ""}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      // A drag shouldn't also count as a click on the buttons/links it started on.
      onClickCapture={(e) => {
        if (moved.current) {
          e.preventDefault();
          e.stopPropagation();
          moved.current = false;
        }
      }}
      onDragStart={(e) => e.preventDefault()}
      aria-roledescription="carousel"
    >
      <div className="hero__banner" ref={bannerRef} aria-hidden>
        {items.map((it, n) => (
          <div key={it.id} className={`hero__bg ${n === i ? "is-active" : ""}`}>
            {seen.has(n) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={it.banner} alt="" decoding="async" fetchPriority={n === 0 ? "high" : "low"} draggable={false} />
            ) : null}
          </div>
        ))}
      </div>
      <div className="hero__shade" />
      <div className="hero__content" key={cur.id} ref={contentRef}>
        {cur.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="hero__logo" src={cur.logo} alt={cur.title} draggable={false} />
        ) : (
          <h1>{cur.title}</h1>
        )}
        <div className="hero__chips">
          {cur.chips.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
        <p className="hero__desc">{cur.description}</p>
        <div className="hero__actions">
          <Link href={`/watch/${cur.id}`} className="hbtn hbtn--white" draggable={false}>
            <Icon name="play" size={15} /> Watch Now
          </Link>
          <Link href={`/anime/${cur.id}`} className="hbtn" draggable={false}>
            <Icon name="info" size={16} /> Details
          </Link>
          <button
            className={`hbtn hbtn--icon ${inList ? "is-on" : ""}`}
            aria-label={inList ? "Remove from My List" : "Add to My List"}
            title={inList ? "In My List" : "Add to My List"}
            onClick={() =>
              setListStatus(
                { id: cur.id, title: cur.title, cover: cur.cover, format: cur.format, episodes: cur.episodes },
                inList ? null : "PLANNING",
              )
            }
          >
            <Icon name={inList ? "check" : "plus"} size={16} />
          </button>
        </div>
      </div>

      {count > 1 ? (
        <>
          <button className="hero__arrow hero__arrow--prev" onClick={() => go(i - 1)} aria-label="Previous">
            <Icon name="prev" size={22} />
          </button>
          <button className="hero__arrow hero__arrow--next" onClick={() => go(i + 1)} aria-label="Next">
            <Icon name="next" size={22} />
          </button>
        </>
      ) : null}

      <div className="hero__dots">
        {items.map((it, n) => (
          <button
            key={it.id}
            className={n === i ? "is-active" : ""}
            onClick={() => go(n)}
            aria-label={`Show ${it.title}`}
            aria-current={n === i}
          >
            {/* The active dot fills up until the next slide. */}
            {n === i ? <span key={i} className={`hero__fill ${paused ? "is-paused" : ""}`} style={{ animationDuration: `${INTERVAL_MS}ms` }} /> : null}
          </button>
        ))}
      </div>
    </section>
  );
}
