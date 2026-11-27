// Invites for the private site. Only the owner creates them (from /admin, with
// ADMIN_PASSWORD). An invite is a username + password; entering it lets one
// person (or `maxUses` people) create an account. Server only.

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { dbGet, dbSet } from "./db";

const scrypt = promisify(scryptCb) as (pw: string, salt: string, len: number) => Promise<Buffer>;
const INDEX = "invites:index";

export type Invite = {
  user: string;
  salt: string;
  hash: string;
  note: string;
  maxUses: number;
  /** Accounts created with this invite. */
  usedBy: string[];
  revoked: boolean;
  createdAt: number;
};

export type InviteSummary = Omit<Invite, "salt" | "hash">;

function summary({ salt: _s, hash: _h, ...rest }: Invite): InviteSummary {
  return rest;
}

/** Easy-to-read random text, no look-alike characters. */
function readable(length: number) {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from(randomBytes(length), (b) => chars[b % chars.length]).join("");
}

export async function createInvite(note: string, maxUses: number): Promise<{ invite: InviteSummary; password: string }> {
  const user = `mayoi-${readable(5)}`;
  const password = `${readable(4)}-${readable(4)}-${readable(4)}`;
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 64)).toString("hex");
  const invite: Invite = {
    user,
    salt,
    hash,
    note: note.slice(0, 80),
    maxUses: Math.max(1, Math.min(100, Math.floor(maxUses) || 1)),
    usedBy: [],
    revoked: false,
    createdAt: Date.now(),
  };
  await dbSet(`invite:${user}`, invite);
  await dbSet(INDEX, [user, ...((await dbGet<string[]>(INDEX)) ?? [])]);
  return { invite: summary(invite), password };
}

export async function listInvites(): Promise<InviteSummary[]> {
  const users = (await dbGet<string[]>(INDEX)) ?? [];
  const all = await Promise.all(users.map((u) => dbGet<Invite>(`invite:${u}`)));
  return all.filter((i): i is Invite => !!i).map(summary);
}

export async function revokeInvite(user: string) {
  const invite = await dbGet<Invite>(`invite:${user}`);
  if (invite) await dbSet(`invite:${user}`, { ...invite, revoked: true });
}

function usable(i: Invite | null): i is Invite {
  return !!i && !i.revoked && i.usedBy.length < i.maxUses;
}

/** True if this invite exists, the password is right, and it still has uses left. */
export async function checkInvite(user: string, password: string): Promise<boolean> {
  const invite = await dbGet<Invite>(`invite:${user.trim().toLowerCase()}`);
  const hash = await scrypt(password.trim(), invite?.salt ?? "0".repeat(32), 64);
  return usable(invite) && timingSafeEqual(hash, Buffer.from(invite.hash, "hex"));
}

export async function inviteUsable(user: string): Promise<boolean> {
  return usable(await dbGet<Invite>(`invite:${user}`));
}

/** Record that `account` was created with this invite. */
export async function useInvite(user: string, account: string) {
  const invite = await dbGet<Invite>(`invite:${user}`);
  if (invite) await dbSet(`invite:${user}`, { ...invite, usedBy: [...invite.usedBy, account] });
}
