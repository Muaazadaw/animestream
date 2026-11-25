"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Countdown from "@/components/Countdown";
import { titleOf, type AiringItem } from "@/lib/anilist";

// Grouping by day happens on the client so it uses the viewer's time zone.
export default function ScheduleView({ items }: { items: AiringItem[] }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  const days = useMemo(() => {
    const map = new Map<string, AiringItem[]>();
    for (const it of items) {
      const key = new Date(it.airingAt * 1000).toDateString();
      map.set(key, [...(map.get(key) ?? []), it]);
    }
    return [...map.entries()];
  }, [items]);

  const [day, setDay] = useState<string | null>(null);
  if (!ready) return <p className="empty">Loading schedule…</p>;

  const active = day ?? days.find(([d]) => d === new Date().toDateString())?.[0] ?? days[0]?.[0];
  const list = days.find(([d]) => d === active)?.[1] ?? [];
  const now = Date.now() / 1000;

  return (
    <>
      <div className="tabs">
        {days.map(([d]) => {
          const date = new Date(d);
          return (
            <button key={d} className={d === active ? "is-active" : ""} onClick={() => setDay(d)}>
              <strong>{date.toLocaleDateString(undefined, { weekday: "short" })}</strong>
              <span>{date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
            </button>
          );
        })}
      </div>
      <div className="schedule">
        {list.map((it) => (
          <Link key={it.id} href={`/anime/${it.media.id}`} className={`sched ${it.airingAt < now ? "sched--aired" : ""}`}>
            <time>{new Date(it.airingAt * 1000).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</time>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={it.media.coverImage.large ?? ""} alt="" loading="lazy" />
            <div className="sched__body">
              <strong>{titleOf(it.media.title)}</strong>
              <span>Episode {it.episode}</span>
            </div>
            <span className="sched__when">{it.airingAt < now ? "Aired" : <Countdown at={it.airingAt} />}</span>
          </Link>
        ))}
        {list.length === 0 ? <p className="empty">Nothing scheduled.</p> : null}
      </div>
    </>
  );
}
