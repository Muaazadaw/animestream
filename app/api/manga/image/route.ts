import { NextResponse } from "next/server";
import { isImageUrl as isMangaKatanaImage } from "@/lib/manga/mangakatana";
import { isImageUrl as isMangaPillImage, REFERER as MANGAPILL_REFERER } from "@/lib/manga/mangapill";

// GET /api/manga/image?u=<MangaKatana or MangaPill image URL> → the image
// MangaKatana's image server answers one connection slowly and browsers open at most
// six to it, so a chapter crawls in. Through here the browser can ask for every page
// at once (HTTP/2), the server fetches them side by side, and the edge cache keeps
// them for the next reader. MangaPill's CDN refuses any Referer but its own, which
// only a server can send. Only those two sites' image URLs are accepted.

const TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

function refererFor(url: string): string | null {
  if (isMangaKatanaImage(url)) return "https://mangakatana.com/";
  if (isMangaPillImage(url)) return MANGAPILL_REFERER;
  return null;
}

export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("u") ?? "";
  const referer = refererFor(url);
  if (!referer) return NextResponse.json({ error: "Not a manga page image" }, { status: 400 });

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
      Referer: referer,
    },
    cache: "no-store",
  }).catch(() => null);
  if (!res?.ok || !res.body) return NextResponse.json({ error: "Couldn't load this image" }, { status: 502 });

  // MangaKatana labels everything application/octet-stream; go by the extension instead.
  const ext = new URL(url).pathname.split(".").pop()?.toLowerCase() ?? "";
  return new Response(res.body, {
    headers: {
      "Content-Type": TYPES[ext] ?? "image/jpeg",
      // Each URL is one fixed page image, so it can be kept a long time.
      "Cache-Control": "public, max-age=86400, s-maxage=2592000, immutable",
    },
  });
}
