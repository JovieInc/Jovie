import { describe, expect, it } from 'vitest';
import type { ProviderLink } from '@/lib/db/schema/content';
import { PROVIDER_CONFIG } from '@/lib/discography/config';
import { resolveTrackProviderLinks } from '@/lib/discography/track-provider-links';

describe('resolveTrackProviderLinks', () => {
  const createLink = (
    providerId: string,
    ownerType: ProviderLink['ownerType'],
    urlSuffix: string
  ): ProviderLink => ({
    id: `link-${providerId}-${urlSuffix}`,
    providerId,
    ownerType,
    releaseId: ownerType === 'release' ? 'release-1' : null,
    trackId: ownerType === 'track' ? 'track-1' : null,
    externalId: null,
    url: `https://example.com/${providerId}/${urlSuffix}`,
    country: null,
    isPrimary: false,
    sourceType: 'manual',
    metadata: {},
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  });

  it('includes every supported DSP when links exist at track or release level', () => {
    const providers = Object.keys(PROVIDER_CONFIG);

    const trackLinks = providers
      .filter((_, index) => index % 2 === 0)
      .map(providerId => createLink(providerId, 'track', 'track'));

    const releaseLinks = providers
      .filter((_, index) => index % 2 === 1)
      .map(providerId => createLink(providerId, 'release', 'release'));

    const result = resolveTrackProviderLinks(trackLinks, releaseLinks);

    expect(result.map(link => link.providerId)).toEqual(providers);
  });

  it('prefers track-level link when both track and release have same DSP', () => {
    const result = resolveTrackProviderLinks(
      [createLink('spotify', 'track', 'track')],
      [createLink('spotify', 'release', 'release')]
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.url).toContain('/track');
  });
});
