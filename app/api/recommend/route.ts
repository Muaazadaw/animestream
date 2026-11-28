import { NextResponse } from "next/server";
import { getPopularPicks, getRecommendations, toQuickHit, type MediaType, type QuickHit } from "@/lib/anilist";

// POST /api/recommend { type, seeds: [{ id, weight }], exclude: number[] } → { pick, reason }
// Something new to watch or read, from AniList users' recommendations for the titles the viewer
// liked most (favourites and high scores weigh more). One of the best few is picked at random, so
// asking again gives something else. Titles already on the viewer's lists are left out.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { type?: string; seeds?: { id: number; weight: number }[]; exclude?: number[] };
  const type: MediaType = body.type === "MANGA" ? "MANGA" : "ANIME";
  const seeds = (body.seeds ?? []).filter((s) => Number.isInteger(s.id) && s.weight > 0).slice(0, 25);
  const exclude = new Set([...(body.exclude ?? []), ...seeds.map((s) => s.id)]);

  try {
    const scores = new Map<number, { hit: QuickHit; score: number; because: { id: number; w: number } }>();
    if (seeds.length) {
      const weight = new Map(seeds.map((s) => [s.id, s.weight]));
      for (const from of await getRecommendations(seeds.map((s) => s.id))) {
        const w = weight.get(from.id) ?? 1;
        for (const { rating, mediaRecommendation: m } of from.recommendations.nodes) {
          if (!m || m.isAdult || m.type !== type || exclude.has(m.id) || rating < 1) continue;
          // Many seeds agreeing counts for more than one very popular recommendation.
          const add = w * Math.log2(1 + rating) * (0.5 + (m.averageScore ?? 60) / 100);
          const cur = scores.get(m.id);
          if (cur) {
            cur.score += add;
            if (w > cur.because.w) cur.because = { id: from.id, w };
          } else scores.set(m.id, { hit: toQuickHit(m), score: add, because: { id: from.id, w } });
        }
      }
    }

    const ranked = [...scores.values()].sort((a, b) => b.score - a.score).slice(0, 5);
    if (ranked.length) {
      const pick = ranked[Math.floor(Math.random() * ranked.length)];
      return NextResponse.json({ pick: pick.hit, because: pick.because.id });
    }
    // Nothing liked yet (or every recommendation is already listed): something popular instead.
    const popular = (await getPopularPicks(type)).filter((p) => !exclude.has(p.id));
    const pick = popular[Math.floor(Math.random() * Math.min(10, popular.length))];
    return NextResponse.json({ pick: pick ?? null, because: null });
  } catch (e) {
    console.error("[api/recommend]", e);
    return NextResponse.json({ error: "Couldn't get a recommendation right now." }, { status: 502 });
  }
}
