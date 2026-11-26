"use client";

// Keeps this browser's library in step with the signed-in account, so
// "continue watching", positions and lists follow the viewer across devices.
// Pulls on load, on focus and every minute; pushes shortly after local changes
// (and right away when the tab is hidden or closed).

import { useEffect, useState } from "react";
import { exportState, getProfile, importState, LOCAL_CHANGE_EVENT, setProfile } from "./storage";
import type { LibraryState } from "./state";

export const AUTH_EVENT = "as:auth";
export type SyncStatus = "idle" | "syncing" | "synced" | "error" | "offline";

let user: string | null | undefined; // undefined = not checked yet
let createdAt: number | null = null;
let status: SyncStatus = "idle";
let lastSynced = 0;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let started = false;

function emit() {
  window.dispatchEvent(new Event(AUTH_EVENT));
}

function setStatus(s: SyncStatus) {
  status = s;
  if (s === "synced") lastSynced = Date.now();
  emit();
}

export async function refreshUser(): Promise<string | null> {
  try {
    const r = await fetch("/api/auth", { cache: "no-store" });
    const data = (await r.json()) as { user: string | null; createdAt?: number | null };
    user = data.user;
    createdAt = data.createdAt ?? null;
  } catch {
    user = null;
  }
  emit();
  return user;
}

/** Send this browser's library and take back the merged result. */
export async function syncNow(): Promise<void> {
  if (!user) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = null;
  setStatus("syncing");
  try {
    const r = await fetch("/api/sync", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(exportState()),
    });
    if (r.status === 401) {
      user = null;
      setStatus("idle");
      return;
    }
    if (!r.ok) throw new Error(String(r.status));
    importState((await r.json()) as LibraryState);
    setStatus("synced");
  } catch {
    setStatus(navigator.onLine ? "error" : "offline");
  }
}

/** At most one push every 15 s while watching (positions are saved every 5 s). */
function schedulePush() {
  if (!user || pushTimer) return;
  pushTimer = setTimeout(syncNow, 15_000);
}

/** Last-chance push when the tab goes away, so the other device sees the latest position. */
function flush() {
  if (!user || !pushTimer) return;
  clearTimeout(pushTimer);
  pushTimer = null;
  fetch("/api/sync", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(exportState()),
    keepalive: true,
  }).catch(() => {});
}

export function startSync() {
  if (started) return;
  started = true;
  refreshUser().then((u) => {
    if (u) syncNow();
  });
  window.addEventListener(LOCAL_CHANGE_EVENT, schedulePush);
  window.addEventListener("focus", () => user && Date.now() - lastSynced > 10_000 && syncNow());
  window.addEventListener("online", () => syncNow());
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flush());
  window.addEventListener("pagehide", flush);
  setInterval(() => user && document.visibilityState === "visible" && syncNow(), 60_000);
}

export async function login(action: "login" | "signup", username: string, password: string): Promise<string | null> {
  const r = await fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, username, password }),
  });
  const data = (await r.json().catch(() => ({}))) as { user?: string; error?: string };
  if (!r.ok) return data.error ?? "Something went wrong.";
  user = data.user ?? null;
  void refreshUser(); // picks up the account's join date
  emit();
  // First sign-in on this device: upload what's here and pull what's there.
  await syncNow();
  return null;
}

export async function logout() {
  await syncNow();
  await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) });
  user = null;
  setStatus("idle");
}

export function useAccount() {
  const [state, setState] = useState({ user, createdAt, status, lastSynced });
  useEffect(() => {
    const update = () => setState({ user, createdAt, status, lastSynced });
    update();
    window.addEventListener(AUTH_EVENT, update);
    return () => window.removeEventListener(AUTH_EVENT, update);
  }, []);
  return state;
}

/** Import a public AniList / MAL list into this browser (and the account, if signed in). */
export async function importList(service: "anilist" | "mal", username: string) {
  const r = await fetch("/api/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ service, username }),
  });
  const data = (await r.json().catch(() => ({}))) as {
    error?: string;
    state?: Partial<LibraryState>;
    counts?: Record<string, number>;
    total?: number;
    avatar?: string | null;
  };
  if (!r.ok || !data.state) throw new Error(data.error ?? "Import failed.");
  importState(data.state, true);
  // Use the AniList avatar until the viewer picks their own.
  if (data.avatar && !getProfile().avatar) setProfile({ avatar: data.avatar });
  if (user) await syncNow();
  return { counts: data.counts ?? {}, total: data.total ?? 0 };
}
