import 'server-only';

import { invalidateReleaseCaches } from '@/lib/cache/releases';
import { db } from '@/lib/db';
import { syncReleasesFromSpotify } from '@/lib/discography/spotify-import';
import {
  processDspArtistDiscoveryJobStandalone,
  processMusicFetchEnrichmentJob,
} from '@/lib/dsp-enrichment/jobs';
import { captureError } from '@/lib/error-tracking';
import { musicfetchNetworkAllowed } from '@/lib/music-resolver/musicfetch-gate';
import { scheduleAfter } from '@/lib/next/schedule-after';
import { trackServerEvent } from '@/lib/server-analytics';
import { isValueBeforePaywallEnabled } from './catalog-preview.server';

const DSP_DISCOVERY_PROVIDERS = [
  'apple_music',
  'deezer',
  'musicbrainz',
] as const;

export interface OnboardingCatalogImportInput {
  readonly profileId: string;
  readonly spotifyArtistId: string;
  readonly spotifyArtistUrl: string;
  /** App user id that owns the profile (release cache key). */
  readonly userId: string;
}

/**
 * JOV-9758 root cause: the /start chat onboarding materialized a profile with
 * the matched Spotify identity but never imported its catalog. Only the
 * legacy form (connectOnboardingSpotifyArtist) and a manual "Sync from
 * Spotify" click on the releases page ran the import, so chat signups got a
 * page with a name and a photo and zero releases or links.
 *
 * This runs the same canonical owners as the legacy connect path:
 * releases (with artwork, tracks and the release smartlink rows), then
 * cross-DSP artist discovery and link enrichment. Every step is idempotent.
 */
export async function runOnboardingCatalogImport(
  input: OnboardingCatalogImportInput
): Promise<{ readonly imported: number; readonly total: number }> {
  const result = await syncReleasesFromSpotify(input.profileId, {
    includeTracks: true,
  });
  invalidateReleaseCaches(input.userId, input.profileId);

  if (!result.success && result.releases.length === 0) {
    await captureError(
      'Onboarding catalog import returned no releases',
      new Error(result.errors.join('; ') || 'unknown import failure'),
      {
        action: 'runOnboardingCatalogImport',
        creatorProfileId: input.profileId,
        spotifyArtistId: input.spotifyArtistId,
      }
    );
    return { imported: 0, total: result.total };
  }

  await trackServerEvent('releases_synced', {
    profileId: input.profileId,
    imported: result.imported,
    source: 'spotify_onboarding_chat',
    isInitialConnect: true,
  });

  try {
    await processDspArtistDiscoveryJobStandalone({
      creatorProfileId: input.profileId,
      spotifyArtistId: input.spotifyArtistId,
      targetProviders: DSP_DISCOVERY_PROVIDERS,
      dedupKey: [
        'inline_dsp_discovery',
        input.profileId,
        input.spotifyArtistId,
        DSP_DISCOVERY_PROVIDERS.join('|'),
      ].join(':'),
    });
  } catch (error) {
    await captureError('Onboarding DSP discovery failed', error, {
      action: 'runOnboardingCatalogImport',
      creatorProfileId: input.profileId,
    });
  }

  if (musicfetchNetworkAllowed()) {
    try {
      await processMusicFetchEnrichmentJob(db, {
        creatorProfileId: input.profileId,
        spotifyUrl: input.spotifyArtistUrl,
        dedupKey: [
          'inline_musicfetch_enrichment',
          input.profileId,
          input.spotifyArtistId,
        ].join(':'),
      });
    } catch (error) {
      await captureError('Onboarding MusicFetch enrichment failed', error, {
        action: 'runOnboardingCatalogImport',
        creatorProfileId: input.profileId,
      });
    }
  }

  return { imported: result.imported, total: result.total };
}

/**
 * Schedule the import after the claim response (Vercel `after()`), so the
 * chat turn stays fast while the catalog lands in the background. The
 * preview already shows the live Spotify catalog in the meantime.
 * Never throws; disabled by the JOV-9758 kill switch.
 */
export function scheduleOnboardingCatalogImport(
  input: OnboardingCatalogImportInput
): boolean {
  if (!isValueBeforePaywallEnabled()) return false;
  scheduleAfter(async () => {
    try {
      await runOnboardingCatalogImport(input);
    } catch (error) {
      await captureError('Onboarding catalog import failed', error, {
        action: 'scheduleOnboardingCatalogImport',
        creatorProfileId: input.profileId,
      });
    }
  });
  return true;
}
