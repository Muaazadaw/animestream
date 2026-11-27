// Extra metadata for the watch and detail pages: per-episode titles,
// synopses and stills, artwork, and the full character list with voice actors.
// Server components only. Episode data and fan artwork come from ani.zip, which
// maps AniList ids to TVDB / fanart.tv; characters come from AniList.

import { plainText, type MediaDetail } from "./anilist";

export type EpisodeMeta = {
  number: number;
  title?: string;
  overview?: string;
  image?: string;
  airDate?: string;
};

export type Artwork = { url: string; kind: "Poster" | "Banner" | "Fanart" | "Still" | "Character" };

type AniZip = {
  episodes?: Record<
    string,
    {
      episode?: string;
      episodeNumber?: number;
      title?: Record<string, string | null> | null;
      overview?: string | null;
      summary?: string | null;
      image?: string | null;
      airdate?: string | null;
      airDate?: string | null;
      airDateUtc?: string | null;
    }
  >;
  images?: { coverType?: string; url?: string }[];
};

async function aniZip(id: number): Promise<AniZip | null> {
  try {
    const res = await fetch(`https://api.ani.zip/mappings?anilist_id=${id}`, { next: { revalidate: 21600 } });
    return res.ok ? ((await res.json()) as AniZip) : null;
  } catch {
    return null;
  }
}

/**
 * Hero art from TVDB: the series' top-rated 1080p background (sharper and better framed than
 * AniList's banner strip) and its transparent title logo. Either may be null.
 */
export async function getHeroArt(id: number): Promise<{ backdrop: string | null; logo: string | null }> {
  const z = await aniZip(id);
  const find = (type: string) => z?.images?.find((i) => i.coverType?.toLowerCase() === type)?.url ?? null;
  const logo = find("clearlogo");
  // Some "clearlogos" are old JPEG icons with a solid background; only PNGs are see-through.
  return { backdrop: find("fanart"), logo: logo && /\.png$/i.test(logo) ? logo : null };
}

/**
 * Pixel size of a JPEG, PNG or WebP image, read from the first 64 KB of the file instead of
 * downloading all of it. Null if it can't be read.
 */
export async function imageSize(url: string): Promise<{ w: number; h: number } | null> {
  try {
    const res = await fetch(url, { headers: { Range: "bytes=0-65535" }, next: { revalidate: 86400 } });
    if (!res.ok) return null;
    const b = new Uint8Array(await res.arrayBuffer());
    const u16 = (i: number) => (b[i] << 8) | b[i + 1];
    const u32 = (i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
    // PNG: width and height sit in the IHDR chunk.
    if (b[0] === 0x89 && b[1] === 0x50) return { w: u32(16), h: u32(20) };
    // WebP (lossy VP8 / lossless VP8L / extended VP8X).
    if (b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
      const kind = String.fromCharCode(b[12], b[13], b[14], b[15]);
      if (kind === "VP8 ") return { w: ((b[27] << 8) | b[26]) & 0x3fff, h: ((b[29] << 8) | b[28]) & 0x3fff };
      if (kind === "VP8L") return { w: 1 + (((b[22] & 0x3f) << 8) | b[21]), h: 1 + (((b[24] & 0xf) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6)) };
      if (kind === "VP8X") return { w: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), h: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
      return null;
    }
    // JPEG: walk the markers to the first start-of-frame.
    if (b[0] !== 0xff || b[1] !== 0xd8) return null;
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { w: u16(i + 7), h: u16(i + 5) };
      }
      i += 2 + u16(i + 2);
    }
    return null;
  } catch {
    return null;
  }
}

/** Episode titles, synopses, stills and air dates, keyed by episode number. */
export async function getEpisodeMeta(m: MediaDetail): Promise<Record<number, EpisodeMeta>> {
  const out: Record<number, EpisodeMeta> = {};

  // AniList's own streaming episodes ("Episode 3 - Title") as a fallback.
  for (const s of m.streamingEpisodes ?? []) {
    const match = /^Episode\s+(\d+)\s*[-:]\s*(.+)$/i.exec(s.title);
    if (match) out[Number(match[1])] = { number: Number(match[1]), title: match[2], image: s.thumbnail };
  }

  const z = await aniZip(m.id);
  for (const [key, e] of Object.entries(z?.episodes ?? {})) {
    const n = Number(e.episode ?? e.episodeNumber ?? key);
    if (!Number.isInteger(n) || n < 1) continue;
    const t = e.title ?? {};
    out[n] = {
      number: n,
      title: t.en || t["x-jat"] || t.ja || out[n]?.title,
      overview: (e.overview || e.summary || undefined)?.trim(),
      image: e.image || out[n]?.image,
      airDate: e.airDateUtc || e.airdate || e.airDate || undefined,
    };
  }
  return out;
}

/** Posters, banners, fan art and episode stills for one show. */
export async function getArtwork(m: MediaDetail, episodes: Record<number, EpisodeMeta>): Promise<Artwork[]> {
  const seen = new Set<string>();
  const out: Artwork[] = [];
  const add = (url: string | null | undefined, kind: Artwork["kind"]) => {
    if (url && !seen.has(url)) {
      seen.add(url);
      out.push({ url, kind });
    }
  };

  add(m.coverImage.extraLarge ?? m.coverImage.large, "Poster");
  add(m.bannerImage, "Banner");
  const z = await aniZip(m.id);
  for (const img of z?.images ?? []) {
    const t = img.coverType?.toLowerCase();
    if (t === "poster") add(img.url, "Poster");
    else if (t === "banner") add(img.url, "Banner");
    else if (t === "fanart") add(img.url, "Fanart");
  }
  for (const e of Object.values(episodes)) add(e.image, "Still");
  for (const r of m.relations.edges) {
    if (r.node.type === "ANIME" && r.relationType !== "CHARACTER") add(r.node.coverImage.extraLarge, "Poster");
  }
  return out;
}

export type VoiceActor = { name: string; image: string | null; language: string };

export type Character = {
  id: number;
  name: string;
  native: string | null;
  image: string | null;
  role: string;
  description: string;
  voiceActors: { japanese: VoiceActor[]; english: VoiceActor[] };
};

type CharPage = {
  Media: {
    characters: {
      pageInfo: { hasNextPage: boolean };
      edges: {
        role: string;
        jp: { name: { full: string }; image: { medium: string | null }; languageV2: string }[];
        en: { name: { full: string }; image: { medium: string | null }; languageV2: string }[];
        node: {
          id: number;
          name: { full: string; native: string | null };
          image: { large: string | null; medium: string | null };
          description: string | null;
        };
      }[];
    };
  } | null;
};

/** Every character (up to 100) with description and Japanese/English voice actors. */
export async function getCharacters(id: number): Promise<Character[]> {
  const out: Character[] = [];
  for (let page = 1; page <= 4; page++) {
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        query: `query ($id: Int, $page: Int) {
          Media(id: $id, type: ANIME) {
            characters(page: $page, perPage: 25, sort: [ROLE, RELEVANCE, ID]) {
              pageInfo { hasNextPage }
              edges {
                role
                jp: voiceActors(language: JAPANESE, sort: [RELEVANCE, ID]) { name { full } image { medium } languageV2 }
                en: voiceActors(language: ENGLISH, sort: [RELEVANCE, ID]) { name { full } image { medium } languageV2 }
                node { id name { full native } image { large medium } description(asHtml: false) }
              }
            }
          }
        }`,
        variables: { id, page },
      }),
      next: { revalidate: 86400 },
    }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as { data?: CharPage } | null;
    const chars = json?.data?.Media?.characters;
    if (!chars) break;
    for (const e of chars.edges) {
      const va = (v: (typeof e.jp)[number]): VoiceActor => ({ name: v.name.full, image: v.image.medium, language: v.languageV2 });
      out.push({
        id: e.node.id,
        name: e.node.name.full,
        native: e.node.name.native,
        image: e.node.image.large ?? e.node.image.medium,
        role: e.role,
        // AniList hides spoilers in ~!...!~ and uses __bold__ markup.
        description: plainText(e.node.description)
          .replace(/~!([\s\S]*?)!~/g, "")
          .replace(/__(.+?)__/g, "$1")
          .trim(),
        voiceActors: { japanese: e.jp.map(va), english: e.en.map(va) },
      });
    }
    if (!chars.pageInfo.hasNextPage) break;
  }
  return out;
}
