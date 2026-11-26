"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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

export default function Hero({ items }: { items: HeroItem[] }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [listed, setListed] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (paused || items.length < 2) return;
    const t = setTimeout(() => setI((n) => (n + 1) % items.length), 7000);
    return () => clearTimeout(t);
  }, [i, paused, items.length]);

  useEffect(() => {
    const sync = () => setListed(new Set(Object.keys(getLists()).map(Number)));
    sync();
    window.addEventListener(STORAGE_EVENT, sync);
    return () => window.removeEventListener(STORAGE_EVENT, sync);
  }, []);

  if (items.length === 0) return null;
  const cur = items[i];
  const inList = listed.has(cur.id);

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
      <div className="hero__content" key={cur.id}>
        {cur.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="hero__logo" src={cur.logo} alt={cur.title} />
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
          <Link href={`/watch/${cur.id}`} className="hbtn hbtn--white">
            <Icon name="play" size={15} /> Watch Now
          </Link>
          <Link href={`/anime/${cur.id}`} className="hbtn">
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
      <div className="hero__dots">
        {items.map((it, n) => (
          <button key={it.id} className={n === i ? "is-active" : ""} onClick={() => setI(n)} aria-label={`Show ${it.title}`} />
        ))}
      </div>
    </section>
  );
}
