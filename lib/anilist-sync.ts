"use client";

// Keeps the library in step with AniList. Two ways to link:
//
// - Connect (two-way): the viewer logs in to AniList and the site gets a token.
//   Progress / status changes here are pushed to AniList, and the full list
//   (private entries too) is pulled back. Needs NEXT_PUBLIC_ANILIST_CLIENT_ID:
//   create a client at https://anilist.co/settings/developer (instant, no review)
//   with redirect URL https://<your site>/settings/anilist.
// - Username (one-way): a public AniList username is re-imported every 30 min.
//
// All calls go from the browser straight to AniList, which allows it (CORS).

import { importList, loginWithAniList } from "./sync";
import {
  ANILIST_USER_LISTS_QUERY,
  entriesFromAniList,
  favouritesFromAniList,
  toLibraryState,
  type AniListUserListsData,
} from "./list-import";
import type { AniListLink, ListEntry } from "./state";
import { getProfile, importState, LIST_CHANGE_EVENT, setProfile } from "./storage";

export const ANILIST_CLIENT_ID = process.env.NEXT_PUBLIC_ANILIST_CLIENT_ID ?? "";
const PULL_EVERY_MS = 30 * 60 * 1000;
const LAST_PULL_KEY = "as:anilist-last-pull";

async function gql<T>(query: string, variables: Record<string, unknown>, token?: string): Promise<T> {
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.errors) throw new Error(json?.errors?.[0]?.message ?? `AniList error ${res.status}`);
  return json.data as T;
}

/** A usable two-way link, or null (missing or expired). */
export function activeLink(): AniListLink | null {
  const link = getProfile().anilist;
  return link && link.expiresAt > Date.now() ? link : null;
}

export function connectUrl() {
  return `https://anilist.co/api/v2/oauth/authorize?client_id=${encodeURIComponent(ANILIST_CLIENT_ID)}&response_type=token`;
}

/**
 * Finish the AniList login: read the token AniList put in the URL hash, sign in
 * to the site with it (an AniList account is the site account), then link the
 * list for two-way sync.
 */
export async function completeConnect(hash: string): Promise<AniListLink> {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const token = params.get("access_token");
  if (!token) throw new Error(params.get("error_description") ?? "AniList didn't send a login token.");
  const failed = await loginWithAniList(token);
  if (failed) throw Object.assign(new Error(failed.error), { needsInvite: !!failed.needsInvite });
  const expiresIn = Number(params.get("expires_in")) || 365 * 86400;
  const { Viewer } = await gql<{ Viewer: { id: number; name: string; avatar: { large: string | null } } }>(
    "query { Viewer { id name avatar { large } } }",
    {},
    token,
  );
  const link: AniListLink = {
    token,
    expiresAt: Date.now() + expiresIn * 1000,
    userId: Viewer.id,
    name: Viewer.name,
    avatar: Viewer.avatar.large,
    autoSync: true,
  };
  setProfile({ anilist: link, anilistUser: null, avatar: getProfile().avatar ?? Viewer.avatar.large });
  await pullFromAniList();
  return link;
}

export function disconnect() {
  setProfile({ anilist: null, anilistUser: null });
}

export function setAutoSync(on: boolean) {
  const link = getProfile().anilist;
  if (link) setProfile({ anilist: { ...link, autoSync: on } });
}

/** Link a public username (one-way). Imports it straight away. */
export async function linkUsername(name: string) {
  const result = await importList("anilist", name);
  setProfile({ anilistUser: name, anilist: null });
  try {
    localStorage.setItem(LAST_PULL_KEY, String(Date.now()));
  } catch {}
  return result;
}

/** Re-import the linked AniList list (token or username). */
export async function pullFromAniList(): Promise<{ total: number } | null> {
  const link = activeLink();
  const profile = getProfile();
  let total: number;
  if (link) {
    const data = await gql<AniListUserListsData>(ANILIST_USER_LISTS_QUERY, { userId: link.userId }, link.token);
    const entries = entriesFromAniList(data);
    importState(toLibraryState(entries, "anilist", favouritesFromAniList(data)).state, true);
    total = entries.length;
  } else if (profile.anilistUser) {
    total = (await importList("anilist", profile.anilistUser)).total;
  } else return null;
  try {
    localStorage.setItem(LAST_PULL_KEY, String(Date.now()));
  } catch {}
  return { total };
}

export function lastPull(): number {
  try {
    return Number(localStorage.getItem(LAST_PULL_KEY)) || 0;
  } catch {
    return 0;
  }
}

// --- Pushing changes made on this site --------------------------------------

const pending = new Map<number, ListEntry | { id: number; removed: true }>();
let pushTimer: ReturnType<typeof setTimeout> | null = null;

async function pushPending() {
  pushTimer = null;
  const link = activeLink();
  if (!link?.autoSync) {
    pending.clear();
    return;
  }
  const batch = [...pending.values()];
  pending.clear();
  for (const change of batch) {
    try {
      if ("removed" in change) {
        const found = await gql<{ MediaList: { id: number } | null }>(
          "query ($userId: Int, $mediaId: Int) { MediaList(userId: $userId, mediaId: $mediaId) { id } }",
          { userId: link.userId, mediaId: change.id },
          link.token,
        ).catch(() => ({ MediaList: null }));
        if (found.MediaList) {
          await gql("mutation ($id: Int) { DeleteMediaListEntry(id: $id) { deleted } }", { id: found.MediaList.id }, link.token);
        }
      } else {
        // Dates go as { year, month, day }; an emptied date is sent as all nulls to clear it.
        const date = (d: string | null | undefined) => {
          if (d === undefined) return undefined;
          const [year, month, day] = (d ?? "").split("-").map(Number);
          return d ? { year, month, day } : { year: null, month: null, day: null };
        };
        await gql(
          `mutation ($mediaId: Int, $status: MediaListStatus, $progress: Int, $scoreRaw: Int, $repeat: Int, $notes: String,
                     $startedAt: FuzzyDateInput, $completedAt: FuzzyDateInput) {
            SaveMediaListEntry(mediaId: $mediaId, status: $status, progress: $progress, scoreRaw: $scoreRaw, repeat: $repeat,
                               notes: $notes, startedAt: $startedAt, completedAt: $completedAt) { id }
          }`,
          {
            mediaId: change.id,
            status: change.status,
            progress: change.progress,
            scoreRaw: change.score,
            repeat: change.repeat,
            notes: change.notes === undefined ? undefined : (change.notes ?? ""),
            startedAt: date(change.startedAt),
            completedAt: date(change.completedAt),
          },
          link.token,
        );
      }
    } catch (e) {
      console.warn("[anilist] push failed", e);
    }
  }
}

let started = false;

export function startAniListSync() {
  if (started) return;
  started = true;
  window.addEventListener(LIST_CHANGE_EVENT, (e) => {
    const change = (e as CustomEvent<ListEntry | { id: number; removed: true }>).detail;
    if (!activeLink()?.autoSync) return;
    pending.set(change.id, change);
    if (!pushTimer) pushTimer = setTimeout(pushPending, 3000);
  });
  window.addEventListener("pagehide", () => {
    if (pending.size) void pushPending();
  });
  const maybePull = () => {
    if (Date.now() - lastPull() > PULL_EVERY_MS) pullFromAniList().catch((e) => console.warn("[anilist] pull failed", e));
  };
  maybePull();
  window.addEventListener("focus", maybePull);
}
