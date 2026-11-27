"use client";

import { useEffect, useState } from "react";
import { getLists, setListStatus, STORAGE_EVENT, type ListEntry, type SavedAnime } from "@/lib/storage";
import type { ListStatus } from "@/lib/state";
import Menu, { Icon, MenuItem } from "./Menu";

const STATUSES: { id: ListStatus; label: string; icon: string }[] = [
  { id: "CURRENT", label: "Watching", icon: "eye" },
  { id: "PLANNING", label: "Planning", icon: "bookmark" },
  { id: "COMPLETED", label: "Completed", icon: "check" },
  { id: "REPEATING", label: "Rewatching", icon: "rewatch" },
  { id: "PAUSED", label: "Paused", icon: "pause" },
  { id: "DROPPED", label: "Dropped", icon: "dropped" },
];

/** "Watching ▾": the show's list status, or "Add to List" when it isn't on a list. */
export default function ListStatusMenu({ anime }: { anime: SavedAnime }) {
  const [entry, setEntry] = useState<ListEntry | null>(null);
  useEffect(() => {
    const sync = () => setEntry(getLists()[anime.id] ?? null);
    sync();
    window.addEventListener(STORAGE_EVENT, sync);
    return () => window.removeEventListener(STORAGE_EVENT, sync);
  }, [anime.id]);
  const status = STATUSES.find((s) => s.id === entry?.status);

  return (
    <Menu
      align="right"
      className={`lstatus ${status ? `lstatus--${status.id.toLowerCase()}` : ""}`}
      label={
        <>
          <Icon name={status?.icon ?? "plus"} size={15} /> {status?.label ?? "Add to List"}
        </>
      }
    >
      {(close) => (
        <>
          {STATUSES.map((s) => (
            <MenuItem key={s.id} icon={<Icon name={s.icon} size={15} />} active={entry?.status === s.id} onClick={() => (setListStatus(anime, s.id), close())}>
              {s.label}
            </MenuItem>
          ))}
          {entry ? (
            <MenuItem icon={<Icon name="trash" size={15} />} onClick={() => (setListStatus(anime, null), close())}>
              Remove from list
            </MenuItem>
          ) : null}
        </>
      )}
    </Menu>
  );
}
