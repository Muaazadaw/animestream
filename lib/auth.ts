// Accounts are AniList identities, with a signed session cookie. A new account
// needs an invite (see lib/invites.ts); after that, signing in with AniList is
// enough on any device. Server only.

import { cookies } from "next/headers";
import { dbGet, dbSet } from "./db";
import { inviteUsable, useInvite } from "./invites";
import { GATE_COOKIE, SESSION_COOKIE, signValue, verifyValue } from "./signed";

const MAX_AGE = 60 * 60 * 24 * 180; // 180 days

type UserRecord = {
  name: string;
  createdAt: number;
  anilistId?: number;
  /** AniList display name and avatar, refreshed at each sign-in. */
  display?: string;
  avatar?: string | null;
  /** The invite this account was created with. */
  invite?: string;
};

export type AniListViewer = { id: number; name: string; avatar: string | null };

/** The session secret. It must come from the environment, because the middleware checks sessions too. */
function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

/** Who an AniList access token belongs to (asked of AniList itself, so it can't be faked). */
export async function viewerFromToken(token: string): Promise<AniListViewer | null> {
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query: "query { Viewer { id name avatar { large } } }" }),
    cache: "no-store",
  }).catch(() => null);
  const json = (await res?.json().catch(() => null)) as { data?: { Viewer?: { id: number; name: string; avatar: { large: string | null } } } } | null;
  const v = json?.data?.Viewer;
  return v ? { id: v.id, name: v.name, avatar: v.avatar.large } : null;
}

export async function userInfo(name: string): Promise<{ createdAt: number | null; display: string | null; avatar: string | null }> {
  const u = await dbGet<UserRecord>(`user:${name}`);
  return { createdAt: u?.createdAt ?? null, display: u?.display ?? null, avatar: u?.avatar ?? null };
}

/**
 * Sign in with AniList. Uses the account already linked to this AniList user;
 * otherwise links the account that's signed in now (older username accounts);
 * otherwise creates one, which needs an invite entered in the last hour.
 */
export async function signInWithAniList(viewer: AniListViewer): Promise<{ account: string } | { error: string }> {
  const jar = await cookies();
  const linkKey = `anilist:${viewer.id}`;
  let account = await dbGet<string>(linkKey);

  if (!account) {
    const current = await currentUser();
    if (current) {
      account = current;
    } else {
      const invite = await verifyValue(secret(), jar.get(GATE_COOKIE)?.value);
      if (!invite || !(await inviteUsable(invite))) {
        return { error: "This AniList account isn't on Mayoi yet. Enter an invite first." };
      }
      account = `al${viewer.id}`;
      await dbSet(`user:${account}`, { name: account, createdAt: Date.now(), invite } satisfies UserRecord);
      await useInvite(invite, account);
      jar.delete(GATE_COOKIE);
    }
    await dbSet(linkKey, account);
  }

  const user = (await dbGet<UserRecord>(`user:${account}`)) ?? { name: account, createdAt: Date.now() };
  await dbSet(`user:${account}`, { ...user, anilistId: viewer.id, display: viewer.name, avatar: viewer.avatar } satisfies UserRecord);
  await startSession(account);
  return { account };
}

export async function startSession(name: string) {
  (await cookies()).set(SESSION_COOKIE, await signValue(secret(), name, MAX_AGE), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** The signed-in account name, or null. */
export async function currentUser(): Promise<string | null> {
  if (!process.env.AUTH_SECRET) return null;
  return verifyValue(secret(), (await cookies()).get(SESSION_COOKIE)?.value);
}
