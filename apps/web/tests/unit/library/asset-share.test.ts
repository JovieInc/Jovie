import { describe, expect, it } from 'vitest';
import {
  buildLibraryAssetShareUrl,
  deriveLibraryAssetShareSlug,
  formatLibraryAssetShareDisplayUrl,
  isLibraryAssetVisibility,
  toLibraryAssetShareViewModel,
} from '@/lib/library/asset-share';
import { generateLibraryAssetShareToken } from '@/lib/library/asset-share/token';

describe('library asset share helpers', () => {
  it('derives release slugs from smart link paths', () => {
    expect(
      deriveLibraryAssetShareSlug({
        assetId: 'release-1',
        itemKind: 'release',
        title: 'Take Me Over',
        smartLinkPath: '/tim/take-me-over',
      })
    ).toBe('take-me-over');
  });

  it('builds public release URLs from smart links', () => {
    expect(
      buildLibraryAssetShareUrl({
        visibility: 'public',
        accessToken: 'abc123',
        shareSlug: 'take-me-over',
        artistHandle: 'tim',
        itemKind: 'release',
        smartLinkPath: '/tim/take-me-over',
      })
    ).toMatch(/\/tim\/take-me-over$/);
  });

  it('builds private token URLs', () => {
    expect(
      buildLibraryAssetShareUrl({
        visibility: 'private',
        accessToken: 'private-token-123',
        shareSlug: 'take-me-over',
        artistHandle: 'tim',
        itemKind: 'release',
        smartLinkPath: '/tim/take-me-over',
      })
    ).toMatch(/\/p\/private-token-123$/);
  });

  it('builds public merch URLs on /a routes', () => {
    expect(
      buildLibraryAssetShareUrl({
        visibility: 'public',
        accessToken: 'private-token-123',
        shareSlug: 'merch-abc12345',
        artistHandle: 'tim',
        itemKind: 'merch',
      })
    ).toMatch(/\/a\/tim\/merch-abc12345$/);
  });

  it('formats display URLs without protocol', () => {
    expect(formatLibraryAssetShareDisplayUrl('https://jov.ie/p/token123')).toBe(
      'jov.ie/p/token123'
    );
  });

  it('validates visibility values', () => {
    expect(isLibraryAssetVisibility('public')).toBe(true);
    expect(isLibraryAssetVisibility('private')).toBe(true);
    expect(isLibraryAssetVisibility('hidden')).toBe(false);
  });

  it('generates fixed-length alphanumeric share tokens', () => {
    const token = generateLibraryAssetShareToken();

    expect(token).toHaveLength(24);
    expect(token).toMatch(/^[a-f0-9]{24}$/);
  });

  it('maps share rows into view models', () => {
    const view = toLibraryAssetShareViewModel({
      assetId: 'release-1',
      visibility: 'private',
      shareSlug: 'take-me-over',
      accessToken: 'token-1',
      artistHandle: 'tim',
      itemKind: 'release',
      smartLinkPath: '/tim/take-me-over',
      tokenRevokedAt: null,
    });

    expect(view.assetId).toBe('release-1');
    expect(view.shareUrl).toMatch(/\/p\/token-1$/);
  });
});
