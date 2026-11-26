import { NextResponse } from "next/server";
import { checkPassword, createUser, currentUser, endSession, normalizeName, startSession, validName } from "@/lib/auth";

// GET  /api/auth                                  → { user }
// POST /api/auth { action: "signup" | "login", username, password }
// POST /api/auth { action: "logout" }
export async function GET() {
  return NextResponse.json({ user: await currentUser() });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { action?: string; username?: string; password?: string };

  if (body.action === "logout") {
    await endSession();
    return NextResponse.json({ user: null });
  }

  const name = normalizeName(body.username ?? "");
  const password = body.password ?? "";
  if (!validName(name)) {
    return NextResponse.json({ error: "Usernames are 3–24 letters, numbers, _ or -." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Passwords need at least 8 characters." }, { status: 400 });
  }

  try {
    if (body.action === "signup") {
      const err = await createUser(name, password);
      if (err) return NextResponse.json({ error: err }, { status: 409 });
    } else if (!(await checkPassword(name, password))) {
      return NextResponse.json({ error: "Wrong username or password." }, { status: 401 });
    }
    await startSession(name);
    return NextResponse.json({ user: name });
  } catch (e) {
    console.error("[api/auth]", e);
    return NextResponse.json({ error: "Account storage is unavailable." }, { status: 500 });
  }
}
