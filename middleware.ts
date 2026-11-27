import { NextResponse, type NextRequest } from "next/server";
import {
  readValue,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  SESSION_RENEW_AFTER,
  sessionCookieOptions,
  signValue,
} from "@/lib/signed";

// The whole site is private: every page and API needs a signed-in account.
// Without one, pages go to /gate (invite + sign-in) and APIs get 401.
// A login renews itself on use, so people stay signed in until they log out.

/** The site's own address. The production *.vercel.app address forwards here, so there's one login. */
const CANONICAL_HOST = process.env.CANONICAL_HOST ?? "mayoi.co";

/** Reachable without an account: the sign-in screen and what it needs, and the owner's invite page. */
const OPEN = [
  /^\/gate(\/|$)/,
  /^\/admin(\/|$)/,
  /^\/settings\/anilist$/, // AniList sends people back here to finish signing in
  /^\/api\/(auth|gate|admin)$/,
];

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const host = req.headers.get("host") ?? "";

  // Logins are tied to an address; keep everyone on one (preview deployments are left alone).
  if (process.env.VERCEL_ENV === "production" && host.endsWith(".vercel.app")) {
    return NextResponse.redirect(`https://${CANONICAL_HOST}${pathname}${search}`, 308);
  }

  if (OPEN.some((re) => re.test(pathname))) return NextResponse.next();

  const secret = process.env.AUTH_SECRET;
  const session = secret ? await readValue(secret, req.cookies.get(SESSION_COOKIE)?.value) : null;
  if (session) {
    const res = NextResponse.next();
    // Push the expiry forward again (at most once a day), so a login only ends with "Log out".
    const age = SESSION_MAX_AGE - (session.exp - Math.floor(Date.now() / 1000));
    if (age > SESSION_RENEW_AFTER) {
      res.cookies.set(
        SESSION_COOKIE,
        await signValue(secret!, session.payload, SESSION_MAX_AGE),
        sessionCookieOptions(req.nextUrl.protocol === "https:"),
      );
    }
    return res;
  }

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
