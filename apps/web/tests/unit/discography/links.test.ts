import { describe, expect, it } from 'vitest';
import {
  buildReleaseSlug,
  buildSmartLinkPath,
  buildSmartLinkUrl,
} from '@/lib/discography/utils';

describe('discography smart link helpers', () => {
  it('builds stable slugs with profile context', () => {
    const slug = buildReleaseSlug('profile-123', 'release-abc');
    expect(slug).toBe('release-abc--profile-123');
  });

  it('normalizes base URLs for smart links', () => {
    const url = buildSmartLinkUrl(
      'https://jov.ie/',
      'release-abc--profile-123'
    );
    expect(url).toBe('https://jov.ie/r/release-abc--profile-123');
  });

  it('appends provider overrides when present', () => {
    const path = buildSmartLinkPath('release-abc--profile-123', 'spotify');
    expect(path).toBe('/r/release-abc--profile-123?dsp=spotify');

    const url = buildSmartLinkUrl(
      'https://main.jov.ie',
      'release-abc--profile-123',
      'soundcloud'
    );
    expect(url).toBe(
      'https://main.jov.ie/r/release-abc--profile-123?dsp=soundcloud'
    );
  });
});
