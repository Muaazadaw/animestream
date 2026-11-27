"use client";

import { useEffect, useState } from "react";
import { LIST_EDITOR_EVENT } from "@/lib/list-editor";
import { isManga, type ListStatus, type SavedAnime } from "@/lib/state";
import { getCustomLists, getLists, isFavorite, setListEntry, setListStatus, toggleFavorite, toggleInCustomList, type CustomList } from "@/lib/storage";
import { Icon } from "./Menu";

type Item = SavedAnime & { banner?: string | null };

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Edit a list entry like on AniList: status, progress, score, start / end dates,
 * rewatches and notes. Saving updates the list here and, when AniList is linked,
 * on AniList too (every list change is pushed there).
 */
export default function ListEditor() {
  const [item, setItem] = useState<Item | null>(null);
  const [status, setStatus] = useState<ListStatus | "">("");
  const [progress, setProgress] = useState("");
  const [score, setScore] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [repeat, setRepeat] = useState("");
  const [notes, setNotes] = useState("");
  const [fav, setFav] = useState(false);
  const [had, setHad] = useState(false);
  const [custom, setCustom] = useState<CustomList[]>([]);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const it = (e as CustomEvent<Item>).detail;
      const cur = getLists()[it.id];
      setItem(it);
      setHad(!!cur);
      setStatus(cur?.status ?? "");
      setProgress(cur?.progress ? String(cur.progress) : "");
      setScore(cur?.score ? String(cur.score / 10) : "");
      setStart(cur?.startedAt ?? "");
      setEnd(cur?.completedAt ?? "");
      setRepeat(cur?.repeat ? String(cur.repeat) : "");
      setNotes(cur?.notes ?? "");
      setFav(isFavorite(it.id));
      setCustom(getCustomLists());
    };
    window.addEventListener(LIST_EDITOR_EVENT, onOpen);
    return () => window.removeEventListener(LIST_EDITOR_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setItem(null);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [item]);

  if (!item) return null;
  const manga = isManga(item);
  const total = (manga ? item.chapters : item.episodes) ?? null;
  const unit = manga ? "Chapters" : "Eps";
  const statuses: { id: ListStatus; label: string }[] = [
    { id: "CURRENT", label: manga ? "Reading" : "Watching" },
    { id: "PLANNING", label: manga ? "Plan to read" : "Planning" },
    { id: "COMPLETED", label: "Completed" },
    { id: "REPEATING", label: manga ? "Re-reading" : "Rewatching" },
    { id: "PAUSED", label: "Paused" },
    { id: "DROPPED", label: "Dropped" },
  ];
  const close = () => setItem(null);

  function save() {
    if (!item) return;
    if (!status) {
      // "Not set" takes it off the list.
      if (had) setListStatus(item, null);
      return close();
    }
    const cur = getLists()[item.id];
    let n = Math.max(0, Math.floor(Number(progress) || 0));
    if (total) n = Math.min(n, total);
    // Like AniList: completing fills progress and the end date; starting fills the start date.
    if (status === "COMPLETED" && total) n = total;
    const s = Math.min(10, Math.max(0, Number(score) || 0));
    setListEntry({
      ...item,
      ...(manga ? { type: "MANGA" as const } : {}),
      status,
      progress: n,
      score: Math.round(s * 10),
      startedAt: start || (status === "CURRENT" && !cur?.startedAt ? today() : null),
      completedAt: end || (status === "COMPLETED" && !cur?.completedAt ? today() : null),
      repeat: Math.max(0, Math.floor(Number(repeat) || 0)),
      notes: notes.trim() || null,
      from: cur?.from ?? "site",
    });
    close();
  }

  return (
    <div className="ledit-bg" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="ledit" role="dialog" aria-modal aria-label={`Edit ${item.title}`}>
        <div className="ledit__art" style={{ backgroundImage: item.cover ? `url(${item.cover})` : undefined }} />
        <div className="ledit__body">
          <div className="ledit__head">
            <h2>{item.title}</h2>
            <button
              className={`ledit__fav ${fav ? "is-on" : ""}`}
              onClick={() => setFav(toggleFavorite(item))}
              aria-label={fav ? "Unfavourite" : "Favourite"}
              title={fav ? "Unfavourite" : "Favourite"}
            >
              <Icon name="heart" size={18} />
            </button>
          </div>

          <div className="ledit__grid">
            <label>
              <span>Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as ListStatus | "")} className={status ? "" : "is-unset"}>
                <option value="">Not set</option>
                {statuses.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>
                {unit} progress{total ? ` / ${total}` : ""}
              </span>
              <input type="number" min={0} max={total ?? undefined} inputMode="numeric" placeholder="0" value={progress} onChange={(e) => setProgress(e.target.value)} />
            </label>
            <label>
              <span>Score (0–10)</span>
              <input type="number" min={0} max={10} step={0.5} inputMode="decimal" placeholder="Not rated" value={score} onChange={(e) => setScore(e.target.value)} />
            </label>
            <label>
              <span>Start date</span>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label>
              <span>End date</span>
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </label>
            <label>
              <span>Total {manga ? "rereads" : "rewatches"}</span>
              <input type="number" min={0} inputMode="numeric" placeholder="0" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
            </label>
            <label className="ledit__notes">
              <span>Notes</span>
              <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
            </label>
          </div>

          {custom.length ? (
            <div className="ledit__custom">
              <span>Custom lists</span>
              <div>
                {custom.map((c) => (
                  <button
                    key={c.id}
                    className={c.items.some((a) => a.id === item.id) ? "is-on" : ""}
                    onClick={() => (toggleInCustomList(c.id, item), setCustom(getCustomLists()))}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="ledit__foot">
            {had ? (
              <button className="ledit__btn ledit__btn--danger" onClick={() => (setListStatus(item, null), close())}>
                <Icon name="trash" size={15} /> Delete
              </button>
            ) : null}
            <span className="ledit__spacer" />
            <button className="ledit__btn" onClick={save}>
              <Icon name="check" size={15} /> Save changes
            </button>
            <button className="ledit__btn" onClick={close}>
              <Icon name="close" size={15} /> Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
