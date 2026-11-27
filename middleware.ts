import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifyValue } from "@/lib/signed";

// The whole site is private: every page and API needs a signed-in account.
// Without one, pages go to /gate (invite + AniList sign-in) and APIs get 401.

/** Reachable without an account: the sign-in screen and what it needs, and the owner's invite page. */
const OPEN = [
  /^\/gate(\/|$)/,
  /^\/admin(\/|$)/,
  /^\/settings\/anilist$/, // AniList sends people back here to finish signing in
  /^\/api\/(auth|gate|admin)$/,
];

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (OPEN.some((re) => re.test(pathname))) return NextResponse.next();

  const secret = process.env.AUTH_SECRET;
  const account = secret ? await verifyValue(secret, req.cookies.get(SESSION_COOKIE)?.value) : null;
  if (account) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sign in to use Mayoi." }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/gate";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except Next's own files and the site icon.
  matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico|robots.txt).*)"],
};
