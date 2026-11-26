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

export default function Hero({ items }: { items: HeroItem[] }) {
  const [i, setI] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [hovered, setHovered] = useState(false);
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [listed, setListed] = useState<Set<number>>(new Set());
  const start = useRef<{ x: number; y: number; t: number; id: number; horizontal: boolean | null } | null>(null);
  const moved = useRef(false);
  const ref = useRef<HTMLElement>(null);

  const count = items.length;
  const paused = hovered || dragging;

  function go(n: number, d: 1 | -1) {
    setDir(d);
    setI(((n % count) + count) % count);
  }

  // Autoplay; restarts whenever the slide changes.
  useEffect(() => {
    if (paused || count < 2) return;
    const t = setTimeout(() => go(i + 1, 1), INTERVAL_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, paused, count]);

  // Arrow keys while the hero is on screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const r = ref.current?.getBoundingClientRect();
      if (!r || r.bottom < 0 || r.top > window.innerHeight) return;
      if (e.key === "ArrowRight") go(i + 1, 1);
      if (e.key === "ArrowLeft") go(i - 1, -1);
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
    setDrag(dx);
  }

  function onPointerUp(e: React.PointerEvent) {
    const s = start.current;
    start.current = null;
    if (!s || !s.horizontal) return;
    const dx = e.clientX - s.x;
    const speed = Math.abs(dx) / Math.max(1, performance.now() - s.t);
    setDragging(false);
    setDrag(0);
    if (Math.abs(dx) > SWIPE_PX || speed > SWIPE_SPEED) {
      if (dx < 0) go(i + 1, 1);
      else go(i - 1, -1);
    }
  }

  const width = ref.current?.clientWidth ?? 1000;
  const progress = Math.min(1, Math.abs(drag) / width);

  return (
    <section
      ref={ref}
      className={`hero ${dragging ? "is-dragging" : ""}`}
      data-dir={dir === 1 ? "next" : "prev"}
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
      {items.map((it, n) => (
        <div
          key={it.id}
          className={`hero__bg ${n === i ? "is-active" : ""}`}
          style={{
            backgroundImage: `url(${it.banner})`,
            // Parallax: the picture follows the finger more slowly than the text.
            transform: n === i && drag ? `translateX(${drag * 0.25}px) scale(1.04)` : undefined,
          }}
          aria-hidden
        />
      ))}
      <div className="hero__shade" />
      <div
        className="hero__content"
        key={cur.id}
        style={drag ? { transform: `translateX(${drag * 0.6}px)`, opacity: 1 - progress * 1.4 } : undefined}
      >
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
          <button className="hero__arrow hero__arrow--prev" onClick={() => go(i - 1, -1)} aria-label="Previous">
            <Icon name="prev" size={22} />
          </button>
          <button className="hero__arrow hero__arrow--next" onClick={() => go(i + 1, 1)} aria-label="Next">
            <Icon name="next" size={22} />
          </button>
        </>
      ) : null}

      <div className="hero__dots">
        {items.map((it, n) => (
          <button
            key={it.id}
            className={n === i ? "is-active" : ""}
            onClick={() => go(n, n >= i ? 1 : -1)}
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
