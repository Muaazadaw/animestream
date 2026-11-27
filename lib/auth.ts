// Username + password accounts with a signed session cookie. Server only.

import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { promisify } from "util";
import { dbGet, dbSet } from "./db";

const scrypt = promisify(scryptCb) as (pw: string, salt: string, len: number) => Promise<Buffer>;
const COOKIE = "as_session";
const MAX_AGE = 60 * 60 * 24 * 180; // 180 days

type UserRecord = { name: string; salt: string; hash: string; createdAt: number };

/** AUTH_SECRET from the environment, or one generated once and kept in the store. */
async function secret(): Promise<string> {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  let s = await dbGet<string>("config:secret");
  if (!s) {
    s = randomBytes(32).toString("hex");
    await dbSet("config:secret", s);
  }
  return s;
}

export function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

export function validName(name: string) {
  return /^[a-z0-9_-]{3,24}$/.test(name);
}

export async function createUser(name: string, password: string): Promise<string | null> {
  const key = `user:${name}`;
  if (await dbGet(key)) return "That username is taken.";
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 64)).toString("hex");
  await dbSet(key, { name, salt, hash, createdAt: Date.now() } satisfies UserRecord);
  return null;
}

export async function userCreatedAt(name: string): Promise<number | null> {
  return (await dbGet<UserRecord>(`user:${name}`))?.createdAt ?? null;
}

export async function checkPassword(name: string, password: string): Promise<boolean> {
  const user = await dbGet<UserRecord>(`user:${name}`);
  // Hash anyway when the user doesn't exist, so timing doesn't reveal it.
  const salt = user?.salt ?? "0".repeat(32);
  const hash = await scrypt(password, salt, 64);
  return !!user && timingSafeEqual(hash, Buffer.from(user.hash, "hex"));
}

/** Set a new password after checking the current one. Returns an error message or null. */
export async function changePassword(name: string, current: string, next: string): Promise<string | null> {
  if (!(await checkPassword(name, current))) return "Your current password is wrong.";
  const user = await dbGet<UserRecord>(`user:${name}`);
  if (!user) return "Account not found.";
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(next, salt, 64)).toString("hex");
  await dbSet(`user:${name}`, { ...user, salt, hash } satisfies UserRecord);
  return null;
}

async function sign(value: string) {
  return createHmac("sha256", await secret()).update(value).digest("base64url");
}

export async function startSession(name: string) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const value = `${name}.${exp}`;
  (await cookies()).set(COOKIE, `${value}.${await sign(value)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

/** The signed-in username, or null. */
export async function currentUser(): Promise<string | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const i = raw.lastIndexOf(".");
  const value = raw.slice(0, i);
  const sig = Buffer.from(raw.slice(i + 1));
  const good = Buffer.from(await sign(value));
  if (sig.length !== good.length || !timingSafeEqual(sig, good)) return null;
  const [name, exp] = value.split(".");
  return Number(exp) * 1000 > Date.now() ? name : null;
}
