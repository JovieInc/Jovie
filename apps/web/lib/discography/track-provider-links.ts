import type { ProviderLink } from '@/lib/db/schema/content';
import { PROVIDER_CONFIG } from '@/lib/discography/config';

const PROVIDER_ORDER = Object.keys(PROVIDER_CONFIG);

/**
 * Build the provider link set for a track.
 *
 * Rule: if a DSP link exists either on the track or on its parent release,
 * it should appear in track-level UI. Track links win when both exist.
 */
export function resolveTrackProviderLinks(
  trackLinks: readonly ProviderLink[],
  releaseLinks: readonly ProviderLink[]
): ProviderLink[] {
  const merged = new Map<string, ProviderLink>();

  for (const link of releaseLinks) {
    merged.set(link.providerId, link);
  }

  for (const link of trackLinks) {
    merged.set(link.providerId, link);
  }

  const orderedKnownProviders = PROVIDER_ORDER.flatMap(providerId => {
    const link = merged.get(providerId);
    return link ? [link] : [];
  });

  const remainingProviders = Array.from(merged.values())
    .filter(link => !(link.providerId in PROVIDER_CONFIG))
    .sort((a, b) => a.providerId.localeCompare(b.providerId));

  return [...orderedKnownProviders, ...remainingProviders];
}
