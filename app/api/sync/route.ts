import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { dbGet, dbSet } from "@/lib/db";
import { emptyState, mergeState, type LibraryState } from "@/lib/state";

// GET /api/sync → the signed-in user's library.
// PUT /api/sync <LibraryState> → merged with what's stored (newest entry wins), returns the result.
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.json((await dbGet<LibraryState>(`library:${user}`)) ?? emptyState());
}

export async function PUT(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const incoming = (await req.json().catch(() => null)) as Partial<LibraryState> | null;
  if (!incoming || typeof incoming !== "object") return NextResponse.json({ error: "Bad body" }, { status: 400 });

  const key = `library:${user}`;
  const merged = mergeState((await dbGet<LibraryState>(key)) ?? emptyState(), incoming);
  await dbSet(key, merged);
  return NextResponse.json(merged);
}
