import 'server-only';

import { isCodeFlagEnabled } from '@/lib/flags/code-flags';
import { spotifyClient } from '@/lib/spotify/client';
import { logger } from '@/lib/utils/logger';
import { spotifyArtistIdSchema } from '@/lib/validation/schemas/spotify';
import {
  buildOnboardingCatalogPreview,
  type CatalogPreviewSourceAlbum,
  ONBOARDING_CATALOG_PREVIEW_LIMIT,
  type OnboardingCatalogPreview,
} from './catalog-preview';

interface AlbumsPage {
  readonly items?: readonly CatalogPreviewSourceAlbum[];
  readonly total?: number;
}

/**
 * JOV-9758 kill switch: FEATURE_ONBOARDING_VALUE_BEFORE_PAYWALL=false turns
 * off the catalog preview and the onboarding catalog import.
 */
export function isValueBeforePaywallEnabled(): boolean {
  return isCodeFlagEnabled('ONBOARDING_VALUE_BEFORE_PAYWALL');
}

/**
 * Newest releases for the onboarding preview. Spotify lists albums before
 * singles, each newest first, so the first page of each group holds the
 * newest overall. Two bounded requests, no pagination. Never throws: a
 * failed lookup returns null and the preview falls back to identity only.
 */
export async function fetchOnboardingCatalogPreview(
  spotifyArtistId: string
): Promise<OnboardingCatalogPreview | null> {
  if (!isValueBeforePaywallEnabled()) return null;
  if (!spotifyArtistIdSchema.safeParse(spotifyArtistId).success) return null;

  try {
    const pages = await Promise.all(
      (['album', 'single'] as const).map(group =>
        spotifyClient.requestJson<AlbumsPage>(
          `/artists/${encodeURIComponent(spotifyArtistId)}/albums?${new URLSearchParams(
            {
              include_groups: group,
              limit: String(ONBOARDING_CATALOG_PREVIEW_LIMIT),
              offset: '0',
              market: 'US',
            }
          )}`
        )
      )
    );
    const albums = pages.flatMap(page => page.items ?? []);
    const total = pages.reduce(
      (sum, page) =>
        sum + (Number.isSafeInteger(page.total) ? Number(page.total) : 0),
      0
    );
    return buildOnboardingCatalogPreview(albums, total);
  } catch (error) {
    logger.warn('Onboarding catalog preview lookup failed', {
      error,
      spotifyArtistId,
    });
    return null;
  }
}
