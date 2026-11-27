import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { createInvite, listInvites, revokeInvite } from "@/lib/invites";

// Invite management for the site owner. Every request needs the
// x-admin-password header to match ADMIN_PASSWORD (set only in Vercel).
//
// GET                                  → { invites }
// POST   { note?, maxUses? }           → { invite, password }   (password is shown once)
// DELETE { user }                      → revokes that invite

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
  return NextResponse.json({ invites: await listInvites() });
}

export async function POST(req: Request) {
  if (!authorized(req)) return denied();
  const body = (await req.json().catch(() => ({}))) as { note?: string; maxUses?: number };
  return NextResponse.json(await createInvite(body.note ?? "", Number(body.maxUses) || 1));
}

export async function DELETE(req: Request) {
  if (!authorized(req)) return denied();
  const body = (await req.json().catch(() => ({}))) as { user?: string };
  if (!body.user) return NextResponse.json({ error: "Which invite?" }, { status: 400 });
  await revokeInvite(body.user);
  return NextResponse.json({ ok: true });
}
