import { describe, expect, it, vi } from 'vitest';

vi.mock('@/constants/app', () => ({ BASE_URL: 'https://jov.ie' }));

import {
  publicCreatorName,
  publicMerchUrl,
  publicReleaseUrl,
} from './public-catalog';
import { publicWorkLinks } from './public-work-links';

describe('public catalog destinations', () => {
  it('encodes the persisted segment and rejects missing, static, injected and traversal slugs', () => {
    const slug = 'café & sunshine';
    const url = publicReleaseUrl('artist', slug)!;
    expect(decodeURIComponent(new URL(url).pathname.split('/').at(-1)!)).toBe(
      slug
    );
    for (const value of [
      null,
      '',
      ' ',
      '.',
      '..',
      'releases',
      'shop',
      'tour',
      'bad/slug',
      'bad\\slug',
      'bad?slug',
      'bad#slug',
      'bad\nslug',
      '\ud800',
    ]) {
      expect(publicReleaseUrl('artist', value), String(value)).toBeNull();
    }
    expect(publicMerchUrl('artist', 'bad/id')).toBeNull();
  });
  it('uses the existing unclaimed-name cleanup and respects the claimed owner name', () => {
    const profile = {
      username: 'creator',
      displayName: 'Name | Instagram, Facebook',
      isClaimed: false,
    };
    expect(publicCreatorName(profile)).toBe('Name');
    expect(publicCreatorName({ ...profile, isClaimed: true })).toBe(
      profile.displayName
    );
    expect(publicCreatorName({ ...profile, displayName: null })).toBe(
      'creator'
    );
  });
  it('shares safe URL and duplicate policy with JSON consumers', () => {
    const credentialUrl = new URL('https://example.com');
    credentialUrl.username = 'fixture';
    expect(
      publicWorkLinks([
        { url: 'https://example.com', platform: 'website' },
        { url: 'https://example.com/', platform: 'custom' },
        { url: 'javascript:alert(1)' },
        { url: 'mailto:private@example.com' },
        { url: '' },
        { url: 'https://example.com/\nInjected' },
        { url: credentialUrl.href },
      ])
    ).toEqual([{ url: 'https://example.com', platform: 'website' }]);
  });
});
