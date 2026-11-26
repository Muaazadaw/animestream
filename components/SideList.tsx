"use client";

import Link from "next/link";
import { useState } from "react";
import { prettyEnum, statusDot, titleOf, type MediaCard } from "@/lib/anilist";
import { Icon } from "./Menu";

const FIRST = 5;

/** A compact ranked list for the home page's side column (Top Airing, Upcoming). */
export default function SideList({ title, items, upcoming }: { title: string; items: MediaCard[]; upcoming?: boolean }) {
  const [open, setOpen] = useState(true);
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, FIRST);

  return (
    <section className="slist">
      <button className="slist__head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className={`slist__chev ${open ? "is-open" : ""}`}>
          <Icon name="next" size={14} />
        </span>
        {title}
      </button>
      {open ? (
        <>
          {shown.map((m) => (
            <Link key={m.id} href={`/anime/${m.id}`} className="slist__item" style={{ backgroundImage: m.bannerImage ? `url(${m.bannerImage})` : undefined }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.coverImage.large ?? undefined} alt="" loading="lazy" />
              <span className="slist__body">
                <span className="slist__title">
                  <i className={`dot ${statusDot(m.status)}`} />
                  {titleOf(m.title)}
                </span>
                <span className="chips">
                  {m.format ? <span>{prettyEnum(m.format)}</span> : null}
                  {m.seasonYear ? <span>{m.seasonYear}</span> : null}
                  {!upcoming && (m.episodes || m.nextAiringEpisode) ? (
                    <span>
                      <Icon name="cc" size={11} /> {m.nextAiringEpisode ? m.nextAiringEpisode.episode - 1 : m.episodes}
                    </span>
                  ) : null}
                  {m.averageScore ? <span>★ {m.averageScore}</span> : null}
                </span>
              </span>
            </Link>
          ))}
          {items.length > FIRST ? (
            <button className="slist__more" onClick={() => setAll(!all)} aria-label={all ? "Show fewer" : "Show more"}>
              <span style={{ transform: all ? "rotate(180deg)" : undefined, display: "inline-flex" }}>
                <Icon name="chevron" size={16} />
              </span>
            </button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
