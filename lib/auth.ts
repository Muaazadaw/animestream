// Accounts and a signed session cookie. An account is either local (username +
// password) or an AniList identity. Creating one needs an invite (see
// lib/invites.ts); after that, signing in is enough on any device. Server only.

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { promisify } from "util";
import { dbGet, dbSet } from "./db";
import { inviteUsable, useInvite } from "./invites";
import { GATE_COOKIE, SESSION_COOKIE, signValue, verifyValue } from "./signed";

const MAX_AGE = 60 * 60 * 24 * 180; // 180 days
const scrypt = promisify(scryptCb) as (pw: string, salt: string, len: number) => Promise<Buffer>;

type UserRecord = {
  name: string;
  createdAt: number;
  anilistId?: number;
  /** AniList display name and avatar, refreshed at each sign-in. */
  display?: string;
  avatar?: string | null;
  /** The invite this account was created with. */
  invite?: string;
  /** Local accounts only. */
  salt?: string;
  hash?: string;
};

export type AniListViewer = { id: number; name: string; avatar: string | null };

/** The session secret. It must come from the environment, because the middleware checks sessions too. */
function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

export function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

/** 3–24 letters, numbers, _ or -; "al" + digits is reserved for AniList accounts. */
export function validName(name: string) {
  return /^[a-z0-9_-]{3,24}$/.test(name) && !/^al\d+$/.test(name);
}

/** The invite entered on this browser in the last hour, if it still has uses left. */
async function enteredInvite(): Promise<string | null> {
  const invite = await verifyValue(secret(), (await cookies()).get(GATE_COOKIE)?.value);
  return invite && (await inviteUsable(invite)) ? invite : null;
}

/** Create a local account with the invite just entered, and sign in. Returns an error message or null. */
export async function createLocalAccount(name: string, password: string): Promise<string | null> {
  const invite = await enteredInvite();
  if (!invite) return "Enter your invite first.";
  if (await dbGet(`user:${name}`)) return "That username is taken.";
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 64)).toString("hex");
  await dbSet(`user:${name}`, { name, createdAt: Date.now(), invite, salt, hash } satisfies UserRecord);
  await useInvite(invite, name);
  (await cookies()).delete(GATE_COOKIE);
  await startSession(name);
  return null;
}

/** Sign in to a local account. */
export async function signInLocal(name: string, password: string): Promise<boolean> {
  const user = await dbGet<UserRecord>(`user:${name}`);
  // Hash anyway when the user doesn't exist, so timing doesn't reveal it.
  const hash = await scrypt(password, user?.salt ?? "0".repeat(32), 64);
  const ok = !!user?.hash && timingSafeEqual(hash, Buffer.from(user.hash, "hex"));
  if (ok) await startSession(name);
  return ok;
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
      const invite = await enteredInvite();
      if (!invite) {
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
