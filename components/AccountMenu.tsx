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

function ago(ms: number) {
  const s = (Date.now() - ms) / 1000;
  if (s < 0) return "soon";
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)}d ago`;
  return new Date(ms).toLocaleDateString("en-US", { month: "short", year: "numeric" });
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

function Notifications() {
  const { items, unread, loading, isUnread, markAllRead } = useNotifications();
  const { open, setOpen, ref } = usePopover();
  // Freeze which items were unread when the panel opened, so they stay highlighted while it's open.
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  function toggle() {
    if (!open) {
      setFresh(new Set(items.filter((n) => isUnread(n.id)).map((n) => n.id)));
      markAllRead();
    }
    setOpen(!open);
  }

  return (
    <div className="acct" ref={ref}>
      <button className={`acct__btn ${open ? "is-open" : ""}`} onClick={toggle} aria-label={`Notifications${unread ? ` (${unread} new)` : ""}`}>
        <Icon name="inbox" size={18} />
        {unread ? <span className="acct__badge">{unread > 9 ? "9+" : unread}</span> : null}
      </button>
      {open ? (
        <div className="acct__pop notif">
          <div className="notif__head">
            <strong>Notifications</strong>
            {loading ? <span className="muted">Updating…</span> : null}
          </div>
          {items.length === 0 ? (
            <p className="notif__empty">
              {loading
                ? "Checking your shows…"
                : "Nothing new. New episodes and seasons of shows in your lists show up here."}
            </p>
          ) : (
            <div className="notif__list">
              {items.map((n) => (
                <Link key={n.id} href={n.href} className={`notif__item ${fresh.has(n.id) ? "is-new" : ""}`} onClick={() => setOpen(false)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={n.cover ?? ""} alt="" loading="lazy" />
                  <span className="notif__body">
                    <span className="notif__title">{n.title}</span>
                    <span className="notif__text">
                      <i className={`notif__kind notif__kind--${n.kind}`} />
                      {n.text}
                    </span>
                    <span className="notif__time">{n.kind === "soon" ? "Today" : ago(n.time)}</span>
                  </span>
                </Link>
              ))}
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
