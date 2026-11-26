"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useNotifications } from "@/lib/notifications";
import { getProfile, STORAGE_EVENT, type Profile } from "@/lib/storage";
import { logout, useAccount } from "@/lib/sync";
import { Icon } from "./Menu";

export function useProfile() {
  const [profile, setProfile] = useState<Profile>({ updatedAt: 0 });
  useEffect(() => {
    const update = () => setProfile(getProfile());
    update();
    window.addEventListener(STORAGE_EVENT, update);
    return () => window.removeEventListener(STORAGE_EVENT, update);
  }, []);
  return profile;
}

export function Avatar({ src, name, size = 36 }: { src?: string | null; name: string; size?: number }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="avatar" src={src} alt="" width={size} height={size} style={{ width: size, height: size }} />
  ) : (
    <span className="avatar avatar--initial" style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function relTime(ms: number) {
  const diff = ms - Date.now();
  const abs = Math.abs(diff) / 1000;
  const n =
    abs < 3600 ? [Math.max(1, Math.round(abs / 60)), "minute"] :
    abs < 86400 ? [Math.round(abs / 3600), "hour"] :
    abs < 86400 * 60 ? [Math.round(abs / 86400), "day"] : null;
  if (!n) return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const text = `${n[0]} ${n[1]}${n[0] === 1 ? "" : "s"}`;
  return diff > 0 ? `in ${text}` : `${text} ago`;
}

/** Closes a popover on outside click / Escape. */
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

const FIRST = 7;

function Notifications() {
  const { aired, upcoming, unread, loading, isRead, setRead, markAllRead } = useNotifications();
  const { user } = useAccount();
  const { open, setOpen, ref } = usePopover();
  const [tab, setTab] = useState<"aired" | "upcoming">("aired");
  const [all, setAll] = useState(false);
  const items = tab === "aired" ? aired : upcoming;
  const shown = all ? items : items.slice(0, FIRST);

  return (
    <div className="acct" ref={ref}>
      <button
        className={`acct__btn ${open ? "is-open" : ""}`}
        onClick={() => (setOpen(!open), setAll(false))}
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
      >
        <Icon name="inbox" size={18} />
        {unread ? <span className="acct__badge">{unread > 9 ? "9+" : unread}</span> : null}
      </button>
      {open ? (
        <div className="acct__pop notif">
          <div className="notif__sync">
            <Icon name="check" size={13} />
            {user ? "Read status synced with your account." : "Read status saved on this device."}
            {unread ? (
              <button className="link-btn notif__all" onClick={markAllRead}>
                Mark all read
              </button>
            ) : null}
          </div>
          <div className="notif__tabs">
            <button className={tab === "aired" ? "is-active" : ""} onClick={() => (setTab("aired"), setAll(false))}>
              Aired{unread ? ` · ${unread}` : ""}
            </button>
            <button className={tab === "upcoming" ? "is-active" : ""} onClick={() => (setTab("upcoming"), setAll(false))}>
              Upcoming
            </button>
          </div>
          <p className="notif__note">Airing dates do not guarantee streaming availability.</p>

          {items.length === 0 ? (
            <p className="notif__empty">
              {loading
                ? "Checking your shows…"
                : tab === "aired"
                  ? "Nothing new. New episodes and seasons of shows in your lists show up here."
                  : "No upcoming episodes for shows in your lists."}
            </p>
          ) : (
            <div className="notif__list">
              {shown.map((n) => {
                const read = n.kind === "upcoming" || isRead(n.id);
                return (
                  <div key={n.id} className={`nrow ${read ? "" : "is-unread"}`}>
                    <Link
                      href={n.href}
                      className="nrow__main"
                      style={{ backgroundImage: n.banner ? `url(${n.banner})` : undefined }}
                      onClick={() => {
                        if (n.kind !== "upcoming") setRead(n.id, true);
                        setOpen(false);
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={n.cover ?? undefined} alt="" loading="lazy" />
                      <span className="nrow__body">
                        <span className="nrow__title">{n.title}</span>
                        <span className="nrow__chips">
                          <span>{n.label}</span>
                          <span>{relTime(n.time)}</span>
                        </span>
                      </span>
                    </Link>
                    {n.kind !== "upcoming" ? (
                      <button className="nrow__read" onClick={() => setRead(n.id, !read)}>
                        <strong>{read ? "Read" : "Unread"}</strong>
                        <span>{read ? "Mark unread" : "Mark read"}</span>
                      </button>
                    ) : null}
                  </div>
                );
              })}
              {items.length > FIRST ? (
                <button className="notif__more" onClick={() => setAll(!all)} aria-label={all ? "Show fewer" : "Show more"}>
                  <span style={{ display: "inline-flex", transform: all ? "rotate(180deg)" : undefined }}>
                    <Icon name="chevron" size={18} />
                  </span>
                </button>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function AccountMenu() {
  const { user } = useAccount();
  const profile = useProfile();
  const { open, setOpen, ref } = usePopover();
  const name = user ?? profile.anilist?.name ?? profile.anilistUser ?? "Guest";

  return (
    <div className="acct-group">
      <Notifications />
      <div className="acct" ref={ref}>
        <button className={`acct__avatar ${open ? "is-open" : ""}`} onClick={() => setOpen(!open)} aria-label="Account menu">
          <Avatar src={profile.avatar} name={name} />
        </button>
        {open ? (
          <div className="acct__pop acct__menu">
            <div className="acct__row">
              <Link href="/library" className="acct__name" onClick={() => setOpen(false)}>
                <Icon name="user" size={16} />
                <span>{name}</span>
              </Link>
              <Link href="/settings" className="acct__gear" onClick={() => setOpen(false)} aria-label="Settings">
                <Icon name="gear" size={18} />
              </Link>
            </div>
            {user ? (
              <button className="acct__logout" onClick={() => (setOpen(false), void logout())}>
                <Icon name="power" size={16} /> Logout
              </button>
            ) : (
              <Link href="/settings#account" className="acct__login" onClick={() => setOpen(false)}>
                <Icon name="user" size={16} /> Sign in to sync
              </Link>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
