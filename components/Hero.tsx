"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export type HeroItem = {
  id: number;
  title: string;
  banner: string;
  description: string;
  meta: string[];
  genres: string[];
  color: string | null;
};

export default function Hero({ items }: { items: HeroItem[] }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || items.length < 2) return;
    const t = setTimeout(() => setI((n) => (n + 1) % items.length), 7000);
    return () => clearTimeout(t);
  }, [i, paused, items.length]);

  if (items.length === 0) return null;
  const cur = items[i];

  return (
    <section className="hero" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      {items.map((it, n) => (
        <div
          key={it.id}
          className={`hero__bg ${n === i ? "is-active" : ""}`}
          style={{ backgroundImage: `url(${it.banner})` }}
          aria-hidden
        />
      ))}
      <div className="hero__shade" />
      <div className="hero__content">
        <span className="hero__rank">#{i + 1} Trending</span>
        <h1>{cur.title}</h1>
        <div className="hero__meta">
          {cur.meta.map((m) => (
            <span key={m}>{m}</span>
          ))}
        </div>
        <p className="hero__desc">{cur.description}</p>
        <div className="hero__genres">
          {cur.genres.slice(0, 4).map((g) => (
            <span key={g} className="chip">
              {g}
            </span>
          ))}
        </div>
        <div className="hero__actions">
          <Link href={`/watch/${cur.id}`} className="btn btn--primary">
            ▶ Watch now
          </Link>
          <Link href={`/anime/${cur.id}`} className="btn">
            Details
          </Link>
        </div>
      </div>
      <div className="hero__dots">
        {items.map((it, n) => (
          <button
            key={it.id}
            className={n === i ? "is-active" : ""}
            onClick={() => setI(n)}
            aria-label={`Show ${it.title}`}
          />
        ))}
      </div>
    </section>
  );
}
