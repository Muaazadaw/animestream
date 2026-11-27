import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_ACCOUNT, isAdminLogin, startSession } from "@/lib/auth";
import { checkInvite } from "@/lib/invites";
import { GATE_COOKIE, signValue, verifyValue } from "@/lib/signed";

const GATE_MAX_AGE = 60 * 60; // an hour to finish signing in with AniList

// GET  /api/gate                       → { invite: string | null }  (an invite entered recently?)
// POST /api/gate { user, password }    → checks an invite and remembers it for an hour
//                                        (the owner's admin login works here too → { admin: true })
export async function GET() {
  const secret = process.env.AUTH_SECRET;
  const invite = secret ? await verifyValue(secret, (await cookies()).get(GATE_COOKIE)?.value) : null;
  return NextResponse.json({ invite, configured: !!secret });
}

export async function POST(req: Request) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return NextResponse.json({ error: "The site isn't set up yet (AUTH_SECRET is missing)." }, { status: 500 });
  const body = (await req.json().catch(() => ({}))) as { user?: string; password?: string };
  const user = (body.user ?? "").trim().toLowerCase();
  if (await isAdminLogin(user, body.password ?? "")) {
    await startSession(ADMIN_ACCOUNT);
    return NextResponse.json({ admin: true });
  }
  if (!/^[a-z0-9-]{3,40}$/.test(user) || !(await checkInvite(user, body.password ?? ""))) {
    // Same answer for a wrong name, wrong password or used-up invite.
    return NextResponse.json({ error: "That invite isn't valid." }, { status: 401 });
  }
  (await cookies()).set(GATE_COOKIE, await signValue(secret, user, GATE_MAX_AGE), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GATE_MAX_AGE,
  });
  return NextResponse.json({ invite: user });
}
