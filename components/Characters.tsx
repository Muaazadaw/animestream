"use client";

import { useState } from "react";
import { prettyEnum } from "@/lib/anilist";
import type { Character } from "@/lib/extras";

const FIRST = 6;

export default function Characters({ characters }: { characters: Character[] }) {
  const [lang, setLang] = useState<"japanese" | "english">("japanese");
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const hasEnglish = characters.some((c) => c.voiceActors.english.length);
  // Manga characters have no voice actors, so there's no second column to keep space for.
  const hasVoices = characters.some((c) => c.voiceActors.japanese.length || c.voiceActors.english.length);
  const shown = all ? characters : characters.slice(0, FIRST);
  const selected = characters.find((c) => c.id === open);

  return (
    <section className="row">
      <div className="row__head">
        <h2>Characters</h2>
        <div className="row__tools">
          <span className="muted">{characters.length}</span>
          {hasEnglish ? (
            <select className="select" value={lang} onChange={(e) => setLang(e.target.value as typeof lang)}>
              <option value="japanese">Japanese</option>
              <option value="english">English</option>
            </select>
          ) : null}
        </div>
      </div>

      <div className="cast">
        {shown.map((c) => {
          const va = c.voiceActors[lang][0];
          return (
            <button key={c.id} className={`cast__row ${open === c.id ? "is-open" : ""}`} onClick={() => setOpen(open === c.id ? null : c.id)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.image ?? undefined} alt="" loading="lazy" />
              <span className="cast__who">
                <strong>{c.name}</strong>
                <span>{prettyEnum(c.role)}</span>
              </span>
              {va ? (
                <span className="cast__who cast__who--va">
                  <strong>{va.name}</strong>
                  <span>{va.language}</span>
                </span>
              ) : null}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {va?.image ? <img src={va.image} alt="" loading="lazy" /> : hasVoices ? <span className="cast__blank" /> : null}
            </button>
          );
        })}
      </div>

      {selected ? (
        <div className="cast__detail">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={selected.image ?? undefined} alt="" />
          <div>
            <h3>
              {selected.name}
              {selected.native ? <span className="muted"> · {selected.native}</span> : null}
            </h3>
            <p>{selected.description || "No description on AniList yet."}</p>
            <a className="muted" href={`https://anilist.co/character/${selected.id}`} target="_blank" rel="noreferrer">
              View on AniList ↗
            </a>
          </div>
          <button className="icon-btn icon-btn--ghost" onClick={() => setOpen(null)} aria-label="Close">
            ✕
          </button>
        </div>
      ) : null}

      {characters.length > FIRST ? (
        <button className="more-btn" onClick={() => setAll((a) => !a)}>
          {all ? "Show less" : `Show all ${characters.length}`}
        </button>
      ) : null}
    </section>
  );
}
