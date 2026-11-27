import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { ADMIN_ACCOUNT, deleteAccount, listAccounts, resetPassword, startSession } from "@/lib/auth";
import { createInvite, listInvites, revokeInvite } from "@/lib/invites";

// Invites and accounts, for the site owner. Every request needs the
// x-admin-password header to match ADMIN_PASSWORD (set only in Vercel).
//
// GET                                         → { invites, accounts }
// POST   { note?, maxUses? }                  → { invite, password }
// POST   { action: "login" }                  → signs this browser in as the admin account
// POST   { action: "reset-password", name }   → { password }   (shown once)
// POST   { action: "delete-account", name }   → deletes the account and its library
// DELETE { user }                             → revokes that invite

function authorized(req: Request): boolean {
  const expected = process.env.ADMIN_PASSWORD ?? "";
  const given = req.headers.get("x-admin-password") ?? "";
  if (expected.length < 12) return false; // refuse to run with a missing or weak admin password
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function denied() {
  return NextResponse.json(
    { error: process.env.ADMIN_PASSWORD ? "Wrong admin password." : "ADMIN_PASSWORD isn't set on the server." },
    { status: 401 },
  );
}

export async function GET(req: Request) {
  if (!authorized(req)) return denied();
  const [invites, accounts] = await Promise.all([listInvites(), listAccounts()]);
  return NextResponse.json({ invites, accounts });
}

export async function POST(req: Request) {
  if (!authorized(req)) return denied();
  const body = (await req.json().catch(() => ({}))) as { action?: string; name?: string; note?: string; maxUses?: number };

  if (body.action === "login") {
    if (!process.env.AUTH_SECRET) return NextResponse.json({ error: "AUTH_SECRET isn't set on the server." }, { status: 500 });
    await startSession(ADMIN_ACCOUNT);
    return NextResponse.json({ user: ADMIN_ACCOUNT });
  }
  if (body.action === "reset-password") {
    const password = body.name ? await resetPassword(body.name) : null;
    if (!password) return NextResponse.json({ error: "Only username accounts have a password to reset." }, { status: 400 });
    return NextResponse.json({ password });
  }
  if (body.action === "delete-account") {
    if (!body.name || !(await deleteAccount(body.name))) return NextResponse.json({ error: "No such account." }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json(await createInvite(body.note ?? "", Number(body.maxUses) || 1));
}

export async function DELETE(req: Request) {
  if (!authorized(req)) return denied();
  const body = (await req.json().catch(() => ({}))) as { user?: string };
  if (!body.user) return NextResponse.json({ error: "Which invite?" }, { status: 400 });
  await revokeInvite(body.user);
  return NextResponse.json({ ok: true });
}
