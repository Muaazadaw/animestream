import type { SiteIds } from "@/lib/extras";

// Icon links to the same anime / manga on database sites (MyAnimeList, AniList…).
// A site only shows up when its id for this title is known, so every link lands
// on the right page.

type Site = { name: string; domain: string; href: string };

function sites(kind: "anime" | "manga", id: number, ids: SiteIds): Site[] {
  const list: (Site | null)[] = [
    ids.mal ? { name: "MyAnimeList", domain: "myanimelist.net", href: `https://myanimelist.net/${kind}/${ids.mal}` } : null,
    { name: "AniList", domain: "anilist.co", href: `https://anilist.co/${kind}/${id}` },
    ids.anidb ? { name: "AniDB", domain: "anidb.net", href: `https://anidb.net/anime/${ids.anidb}` } : null,
    ids.kitsu ? { name: "Kitsu", domain: "kitsu.app", href: `https://kitsu.app/${kind}/${ids.kitsu}` } : null,
    ids.animeplanet
      ? { name: "Anime-Planet", domain: "anime-planet.com", href: `https://www.anime-planet.com/${kind}/${ids.animeplanet}` }
      : null,
  ];
  return list.filter((s): s is Site => !!s);
}

export default function InfoLinks({ kind, id, title, ids }: { kind: "anime" | "manga"; id: number; title: string; ids: SiteIds }) {
  return (
    <div className="infolinks">
      {sites(kind, id, ids).map((s) => (
        <a key={s.name} href={s.href} target="_blank" rel="noreferrer" title={s.name} aria-label={`${title} on ${s.name}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`https://www.google.com/s2/favicons?domain=${s.domain}&sz=64`} alt="" width={20} height={20} loading="lazy" />
        </a>
      ))}
    </div>
  );
}
