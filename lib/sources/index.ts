import { aniflowProvider } from "./aniflow";
import { demoProvider } from "./demo";
import { selfHostedProvider } from "./self-hosted";
import type { AnimeRef, EpisodeInfo, SourceProvider } from "./types";

const PROVIDERS: SourceProvider[] = [aniflowProvider, selfHostedProvider, demoProvider];

function getProvider(id: string): SourceProvider | undefined {
  return PROVIDERS.find((provider) => provider.id === id);
}

function getEnabledProviders(): SourceProvider[] {
  return PROVIDERS.filter((provider) => provider.isEnabled());
}

export async function getEpisodes(
  providerId: string,
  anime: AnimeRef,
): Promise<EpisodeInfo[]> {
  const provider = getProvider(providerId) ?? getEnabledProviders()[0];

  if (!provider) {
    return [];
  }

  return provider.getEpisodes(anime);
}

export async function getStream(
  providerId: string,
  anime: AnimeRef,
  episode: number,
) {
  const provider = getProvider(providerId) ?? getEnabledProviders()[0];

  if (!provider) {
    return null;
  }

  return provider.getStream(anime, episode);
}

export type { AnimeRef, EpisodeInfo, SourceProvider, Stream } from "./types";