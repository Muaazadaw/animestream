import { NextResponse } from "next/server";
import { animeRef, findProvider } from "@/lib/sources";

// GET /api/stream?id=<anilistId>&ep=<number>&source=<providerId>
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));
  const ep = Number(searchParams.get("ep"));
  const source = searchParams.get("source") ?? "";

  if (!Number.isInteger(id) || !Number.isInteger(ep) || ep < 1) {
    return NextResponse.json({ error: "Invalid id or episode" }, { status: 400 });
  }
  const provider = findProvider(source);
  if (!provider) return NextResponse.json({ error: "Unknown source" }, { status: 404 });

  try {
    const anime = await animeRef(id);
    if (!anime) return NextResponse.json({ error: "Anime not found" }, { status: 404 });
    const stream = await provider.getStream(anime, ep);
    if (!stream) return NextResponse.json({ error: "Episode not available on this server" }, { status: 404 });
    return NextResponse.json(stream);
  } catch (e) {
    console.error(`[api/stream] ${source} failed`, e);
    return NextResponse.json({ error: "Could not load stream" }, { status: 502 });
  }
}
