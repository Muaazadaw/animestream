"use client";

import { useEffect, useState } from "react";
import type { Artwork as Art } from "@/lib/extras";
import { Icon } from "./Menu";

const FIRST = 12;
const KINDS: { id: Art["kind"] | "All"; label: string }[] = [
  { id: "All", label: "All" },
  { id: "Poster", label: "Posters" },
  { id: "Banner", label: "Banners" },
  { id: "Fanart", label: "Fan art" },
  { id: "Still", label: "Episode stills" },
];

export default function Artwork({ images }: { images: Art[] }) {
  const [kind, setKind] = useState<(typeof KINDS)[number]["id"]>("All");
  const [all, setAll] = useState(false);
  const [zoom, setZoom] = useState<number | null>(null);
  const filtered = kind === "All" ? images : images.filter((i) => i.kind === kind);
  const shown = all ? filtered : filtered.slice(0, FIRST);

  useEffect(() => {
    if (zoom === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoom(null);
      if (e.key === "ArrowRight") setZoom((z) => (z === null ? z : (z + 1) % filtered.length));
      if (e.key === "ArrowLeft") setZoom((z) => (z === null ? z : (z - 1 + filtered.length) % filtered.length));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [zoom, filtered.length]);

  if (images.length === 0) return null;

  return (
    <section className="row">
      <div className="row__head">
        <div className="art__head">
          <span className="art__icon">
            <Icon name="image" size={18} />
          </span>
          <div>
            <h2>Artwork &amp; Posters</h2>
            <span className="muted">{images.length} images</span>
          </div>
        </div>
        <select className="select" value={kind} onChange={(e) => (setKind(e.target.value as typeof kind), setAll(false))}>
          {KINDS.filter((k) => k.id === "All" || images.some((i) => i.kind === k.id)).map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
      </div>

      <div className={`art ${all ? "" : "art--clipped"}`}>
        {shown.map((img, i) => (
          <button key={img.url} className={`art__item art__item--${img.kind.toLowerCase()}`} onClick={() => setZoom(i)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.url} alt={img.kind} loading="lazy" />
          </button>
        ))}
      </div>

      {filtered.length > FIRST ? (
        <button className="more-btn" onClick={() => setAll((a) => !a)}>
          {all ? "Show less" : `View all ${filtered.length} images`} <Icon name="chevron" size={14} />
        </button>
      ) : null}

      {zoom !== null && filtered[zoom] ? (
        <div className="lightbox" onClick={() => setZoom(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={filtered[zoom].url} alt="" onClick={(e) => e.stopPropagation()} />
          <button className="lightbox__close" aria-label="Close">
            <Icon name="close" size={22} />
          </button>
          <span className="lightbox__count">
            {zoom + 1} / {filtered.length} · {filtered[zoom].kind}
          </span>
        </div>
      ) : null}
    </section>
  );
}
