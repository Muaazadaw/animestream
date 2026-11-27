import { NextResponse } from "next/server";
import {
  ADMIN_ACCOUNT,
  createLocalAccount,
  currentUser,
  endSession,
  isAdminLogin,
  normalizeName,
  sessionRemoved,
  signInLocal,
  signInWithAniList,
  startSession,
  userInfo,
  validName,
  viewerFromToken,
} from "@/lib/auth";

// GET  /api/auth                                → { user, createdAt, display, avatar }
// POST /api/auth { action: "anilist", token }   → signs in with an AniList access token
// POST /api/auth { action: "signup", username, password }  → local account (needs an invite entered first)
// POST /api/auth { action: "login", username, password }
// POST /api/auth { action: "logout" }
export async function GET() {
  const user = await currentUser();
  if (!user) {
    // The owner deleted this account: clear the login so the next page goes to the sign-in screen.
    if (await sessionRemoved().catch(() => false)) {
      await endSession();
      return NextResponse.json({ user: null, removed: true });
    }
    return NextResponse.json({ user: null, createdAt: null, display: null, avatar: null });
  }
  return NextResponse.json({ user, ...(await userInfo(user).catch(() => ({ createdAt: null, display: null, avatar: null }))) });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { action?: string; token?: string; username?: string; password?: string };

  if (body.action === "logout") {
    await endSession();
    return NextResponse.json({ user: null });
  }

  if (body.action === "signup" || body.action === "login") {
    if (!process.env.AUTH_SECRET) {
      return NextResponse.json({ error: "The site isn't set up yet (AUTH_SECRET is missing)." }, { status: 500 });
    }
    const name = normalizeName(body.username ?? "");
    const password = body.password ?? "";
    try {
      if (body.action === "signup") {
        if (!validName(name)) return NextResponse.json({ error: "Usernames are 3–24 letters, numbers, _ or -." }, { status: 400 });
        if (password.length < 8) return NextResponse.json({ error: "Passwords need at least 8 characters." }, { status: 400 });
        const err = await createLocalAccount(name, password);
        if (err) return NextResponse.json({ error: err, needsInvite: err.startsWith("Enter your invite") }, { status: 400 });
      } else if (await isAdminLogin(name, password)) {
        await startSession(ADMIN_ACCOUNT);
        return NextResponse.json({ user: ADMIN_ACCOUNT });
      } else if (!(await signInLocal(name, password))) {
        return NextResponse.json({ error: "Wrong username or password." }, { status: 401 });
      }
      return NextResponse.json({ user: name });
    } catch (e) {
      console.error("[api/auth]", e);
      return NextResponse.json({ error: "Account storage is unavailable." }, { status: 500 });
    }
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
