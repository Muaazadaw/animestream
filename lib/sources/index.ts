import { airedEpisodes, getAnime, titleOf, type MediaDetail } from "../anilist";
import { aniflowProvider } from "./aniflow";
import { demoProvider } from "./demo";
import { selfHostedProvider } from "./self-hosted";
import type { AnimeRef, EpisodeInfo, SourceProvider } from "./types";

// Register providers here. Order = order on the server picker; the first one
// with episodes is selected by default.
const PROVIDERS: SourceProvider[] = [aniflowProvider, selfHostedProvider, demoProvider];

export function enabledProviders() {
  return PROVIDERS.filter((p) => p.isEnabled());
}

export function findProvider(id: string) {
  return enabledProviders().find((p) => p.id === id) ?? null;
}

export function toAnimeRef(m: MediaDetail): AnimeRef {
  return { id: m.id, title: titleOf(m.title), totalEpisodes: m.episodes, airedEpisodes: airedEpisodes(m) };
}

export async function animeRef(id: number): Promise<AnimeRef | null> {
  const m = await getAnime(id);
  return m ? toAnimeRef(m) : null;
}

export type ProviderEpisodes = { id: string; name: string; episodes: EpisodeInfo[] };

/** Episode lists from every enabled provider; a failing provider is skipped. */
export async function episodesFor(anime: AnimeRef): Promise<ProviderEpisodes[]> {
  const results = await Promise.all(
    enabledProviders().map(async (p) => {
      try {
        return { id: p.id, name: p.name, episodes: await p.getEpisodes(anime) };
      } catch (e) {
        console.error(`[sources] ${p.id} getEpisodes failed`, e);
        return { id: p.id, name: p.name, episodes: [] };
      }
    }),
  );
  return results.filter((r) => r.episodes.length > 0);
}

export type { AnimeRef, EpisodeInfo, SourceProvider, Stream } from "./types";