import { NextResponse } from "next/server";
import { isImageUrl } from "@/lib/manga/mangakatana";

// GET /api/manga/image?u=<MangaKatana image URL> → the image
// MangaKatana's image server answers one connection slowly and browsers open at most
// six to it, so a chapter crawls in. Through here the browser can ask for every page
// at once (HTTP/2), the server fetches them side by side, and the edge cache keeps
// them for the next reader. Only MangaKatana image URLs are accepted.

const TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("u") ?? "";
  if (!isImageUrl(url)) return NextResponse.json({ error: "Not a MangaKatana image" }, { status: 400 });

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
      Referer: "https://mangakatana.com/",
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
