import type { SubmissionProvider } from '../types';
import { musicBrainzAuthenticatedEditProvider } from './musicbrainz';
import { xperiAllMusicProvider } from './xperi-allmusic';

const PROVIDERS: Record<string, SubmissionProvider> = {
  [xperiAllMusicProvider.id]: xperiAllMusicProvider,
  [musicBrainzAuthenticatedEditProvider.id]:
    musicBrainzAuthenticatedEditProvider,
};

const PREPARABLE_PROVIDER_IDS = new Set(['xperi_allmusic_email']);

export function getSubmissionProviders(): SubmissionProvider[] {
  return Object.values(PROVIDERS);
}

export function getSubmissionProvider(
  providerId: string
): SubmissionProvider | undefined {
  return PROVIDERS[providerId];
}

export function getPreparableProviderIds(): string[] {
  return Array.from(PREPARABLE_PROVIDER_IDS);
}

export function assertSupportedSubmissionProviders(
  providerIds: string[]
): void {
  for (const providerId of providerIds) {
    if (!PREPARABLE_PROVIDER_IDS.has(providerId)) {
      throw new Error(`Unsupported submission provider: ${providerId}`);
    }
  }
}
