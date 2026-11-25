"use client";

import Link from "next/link";
import { useRef } from "react";

export default function Row({ title, href, children }: { title: string; href?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.85, behavior: "smooth" });

  return (
    <section className="row">
      <div className="row__head">
        <h2>{title}</h2>
        <div className="row__tools">
          {href ? (
            <Link href={href} className="row__more">
              View all
            </Link>
          ) : null}
          <button className="icon-btn" onClick={() => scroll(-1)} aria-label="Scroll left">
            ‹
          </button>
          <button className="icon-btn" onClick={() => scroll(1)} aria-label="Scroll right">
            ›
          </button>
        </div>
      </div>
      <div className="row__track" ref={ref}>
        {children}
      </div>
    </section>
  );
}
