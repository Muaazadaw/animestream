import { airedEpisodes, getAnime, titleOf, type MediaDetail } from "../anilist";
import { aniflowProvider } from "./aniflow";
import { anivexaHardSubProvider, anivexaProvider } from "./anivexa";
import { demoProvider } from "./demo";
import { kickassanimeProvider } from "./kickassanime";
import { selfHostedProvider } from "./self-hosted";
import type { AnimeRef, Audio, EpisodeInfo, SourceProvider } from "./types";

// Register providers here. Order = order on the server picker; the first one
// with episodes is selected by default.
const PROVIDERS: SourceProvider[] = [
  aniflowProvider,
  anivexaProvider,
  anivexaHardSubProvider,
  kickassanimeProvider,
  selfHostedProvider,
  demoProvider,
];

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

export type ProviderEpisodes = { id: string; name: string; audio: Audio[]; tags: string[]; episodes: EpisodeInfo[] };

/** How long the watch page waits for one provider's episode list. */
const EPISODES_TIMEOUT_MS = 6000;

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

/**
 * Episode lists from every enabled provider. A failing or slow provider (e.g.
 * an API waking from a cold start) is skipped rather than holding up the page.
 */
export async function episodesFor(anime: AnimeRef): Promise<ProviderEpisodes[]> {
  const results = await Promise.all(
    enabledProviders().map(async (p) => {
      const base = { id: p.id, name: p.name, audio: p.audio ?? (["sub"] as Audio[]), tags: p.tags ?? [] };
      try {
        return { ...base, episodes: await withTimeout(p.getEpisodes(anime), EPISODES_TIMEOUT_MS, p.id) };
      } catch (e) {
        console.error(`[sources] ${p.id} getEpisodes failed`, e);
        return { ...base, episodes: [] };
      }
    }),
  );
  return results.filter((r) => r.episodes.length > 0);
}

export type { AnimeRef, Audio, EpisodeInfo, SourceProvider, Stream } from "./types";