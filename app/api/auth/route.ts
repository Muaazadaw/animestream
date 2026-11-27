import { NextResponse } from "next/server";
import { currentUser, endSession, signInWithAniList, userInfo, viewerFromToken } from "@/lib/auth";

// GET  /api/auth                                → { user, createdAt, display, avatar }
// POST /api/auth { action: "anilist", token }   → signs in with an AniList access token
// POST /api/auth { action: "logout" }
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ user: null, createdAt: null, display: null, avatar: null });
  return NextResponse.json({ user, ...(await userInfo(user).catch(() => ({ createdAt: null, display: null, avatar: null }))) });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { action?: string; token?: string };

  if (body.action === "logout") {
    await endSession();
    return NextResponse.json({ user: null });
  }

  if (body.action === "anilist") {
    if (!process.env.AUTH_SECRET) {
      return NextResponse.json({ error: "The site isn't set up yet (AUTH_SECRET is missing)." }, { status: 500 });
    }
    const viewer = body.token ? await viewerFromToken(body.token) : null;
    if (!viewer) return NextResponse.json({ error: "AniList didn't accept that sign-in. Try again." }, { status: 401 });
    try {
      const result = await signInWithAniList(viewer);
      if ("error" in result) return NextResponse.json({ ...result, needsInvite: true }, { status: 403 });
      return NextResponse.json({ user: result.account, display: viewer.name, avatar: viewer.avatar });
    } catch (e) {
      console.error("[api/auth]", e);
      return NextResponse.json({ error: "Account storage is unavailable." }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
