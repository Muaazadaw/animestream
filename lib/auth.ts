// Accounts and a signed session cookie. An account is either local (username +
// password) or an AniList identity. Creating one needs an invite (see
// lib/invites.ts); after that, signing in is enough on any device. Server only.

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { promisify } from "util";
import { dbDel, dbGet, dbSet } from "./db";
import { inviteUsable, listInvites, useInvite } from "./invites";
import { GATE_COOKIE, SESSION_COOKIE, SESSION_MAX_AGE, sessionCookieOptions, signValue, verifyValue } from "./signed";

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

/** The owner's own account, signed in from /admin with ADMIN_PASSWORD (for testing the site). */
export const ADMIN_ACCOUNT = "admin";
const USERS_INDEX = "users:index";

async function indexUser(name: string) {
  const all = (await dbGet<string[]>(USERS_INDEX)) ?? [];
  if (!all.includes(name)) await dbSet(USERS_INDEX, [name, ...all]);
}

export function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

/** 3–24 letters, numbers, _ or -; "al" + digits is reserved for AniList accounts. */
export function validName(name: string) {
  return /^[a-z0-9_-]{3,24}$/.test(name) && !/^al\d+$/.test(name) && name !== ADMIN_ACCOUNT;
}

/** The invite entered on this browser in the last hour, if it still has uses left. */
async function enteredInvite(): Promise<string | null> {
  const invite = await verifyValue(secret(), (await cookies()).get(GATE_COOKIE)?.value);
  return invite && (await inviteUsable(invite)) ? invite : null;
}

/** True for the owner's sign-in (ADMIN_USER + ADMIN_PASSWORD from the environment). */
export async function isAdminLogin(name: string, password: string): Promise<boolean> {
  const user = (process.env.ADMIN_USER ?? "").trim().toLowerCase();
  const expected = process.env.ADMIN_PASSWORD ?? "";
  if (!user || expected.length < 12 || name !== user) return false;
  // Compare hashes so the check takes the same time whatever was typed.
  const [a, b] = await Promise.all([scrypt(password, "admin-login", 32), scrypt(expected, "admin-login", 32)]);
  return timingSafeEqual(a, b);
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
  await indexUser(name);
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
  if (name === ADMIN_ACCOUNT) return { createdAt: null, display: "Admin", avatar: null };
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
    if (current && current !== ADMIN_ACCOUNT) {
      account = current;
    } else {
      const invite = await enteredInvite();
      if (!invite) {
        return { error: "This AniList account isn't on Mayoi yet. Enter an invite first." };
      }
      account = `al${viewer.id}`;
      await dbSet(`user:${account}`, { name: account, createdAt: Date.now(), invite } satisfies UserRecord);
      await useInvite(invite, account);
      await indexUser(account);
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
  (await cookies()).set(
    SESSION_COOKIE,
    await signValue(secret(), name, SESSION_MAX_AGE),
    sessionCookieOptions(process.env.NODE_ENV === "production"),
  );
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** The name in this browser's login cookie, whether or not the account still exists. */
async function sessionName(): Promise<string | null> {
  if (!process.env.AUTH_SECRET) return null;
  return verifyValue(secret(), (await cookies()).get(SESSION_COOKIE)?.value);
}

/** The signed-in account name, or null. An account the owner deleted counts as signed out. */
export async function currentUser(): Promise<string | null> {
  const name = await sessionName();
  if (!name) return null;
  if (name === ADMIN_ACCOUNT) return name;
  return (await dbGet(`user:${name}`)) ? name : null;
}

/** True if this browser is signed in to an account that has since been deleted. */
export async function sessionRemoved(): Promise<boolean> {
  const name = await sessionName();
  return !!name && name !== ADMIN_ACCOUNT && !(await dbGet(`user:${name}`));
}

export type AccountSummary = {
  name: string;
  kind: "local" | "anilist";
  /** AniList name for AniList accounts. */
  display: string | null;
  invite: string | null;
  createdAt: number | null;
};

/** Every account: the ones recorded at sign-up plus any listed on an invite. */
export async function listAccounts(): Promise<AccountSummary[]> {
  const names = new Set((await dbGet<string[]>(USERS_INDEX)) ?? []);
  for (const i of await listInvites()) for (const u of i.usedBy) names.add(u);
  const users = await Promise.all([...names].map((n) => dbGet<UserRecord>(`user:${n}`)));
  return users
    .filter((u): u is UserRecord => !!u)
    .map((u) => ({
      name: u.name,
      kind: u.hash ? ("local" as const) : ("anilist" as const),
      display: u.display ?? null,
      invite: u.invite ?? null,
      createdAt: u.createdAt ?? null,
    }))
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

/** Delete an account and its synced library. Its logins stop working on their next request. */
export async function deleteAccount(name: string): Promise<boolean> {
  const user = await dbGet<UserRecord>(`user:${name}`);
  if (!user) return false;
  await dbDel(`user:${name}`);
  await dbDel(`library:${name}`);
  if (user.anilistId) await dbDel(`anilist:${user.anilistId}`);
  await dbSet(USERS_INDEX, ((await dbGet<string[]>(USERS_INDEX)) ?? []).filter((n) => n !== name));
  return true;
}

/** Give a local account a new random password. Returns it (shown to the owner once), or null. */
export async function resetPassword(name: string): Promise<string | null> {
  const user = await dbGet<UserRecord>(`user:${name}`);
  if (!user?.hash) return null;
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const part = () => Array.from(randomBytes(4), (b) => chars[b % chars.length]).join("");
  const password = `${part()}-${part()}-${part()}`;
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 64)).toString("hex");
  await dbSet(`user:${name}`, { ...user, salt, hash } satisfies UserRecord);
  return password;
}
