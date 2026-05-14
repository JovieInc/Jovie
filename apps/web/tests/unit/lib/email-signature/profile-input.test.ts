import { describe, expect, it } from 'vitest';

import { buildSignatureInputFromProfile } from '@/lib/email-signature/profile-input';

describe('buildSignatureInputFromProfile', () => {
  it('returns null when the username is empty', () => {
    expect(
      buildSignatureInputFromProfile({
        profile: { username: '   ' },
      })
    ).toBeNull();
  });

  it('falls back to the handle when displayName is missing', () => {
    const input = buildSignatureInputFromProfile({
      profile: { username: 'deadmau5' },
    });
    expect(input).toMatchObject({ name: 'deadmau5', handle: 'deadmau5' });
  });

  it('joins genre + location into a tagline', () => {
    const input = buildSignatureInputFromProfile({
      profile: {
        username: 'a',
        displayName: 'Artist A',
        genres: ['', 'House'],
        location: 'Berlin',
      },
    });
    expect(input?.tagline).toBe('House • Berlin');
  });

  it('omits tagline when no genre or location is available', () => {
    const input = buildSignatureInputFromProfile({
      profile: { username: 'a', displayName: 'A' },
    });
    expect(input?.tagline).toBeUndefined();
  });

  it('dedupes social links by URL and labels with platform when label is missing', () => {
    const input = buildSignatureInputFromProfile({
      profile: { username: 'a' },
      socials: [
        { label: 'Instagram', url: 'https://instagram.com/a' },
        { label: '', url: 'https://spotify.com/a' },
        { label: 'Instagram (dup)', url: 'https://instagram.com/a' },
      ],
    });
    expect(input?.socials).toHaveLength(2);
    expect(input?.socials?.[0]).toEqual({
      label: 'Instagram',
      url: 'https://instagram.com/a',
    });
    expect(input?.socials?.[1]).toEqual({
      label: 'https://spotify.com/a',
      url: 'https://spotify.com/a',
    });
  });

  it('passes through hideJovieBranding when set', () => {
    const input = buildSignatureInputFromProfile({
      profile: { username: 'a' },
      hideJovieBranding: true,
    });
    expect(input?.hideJovieBranding).toBe(true);
  });
});
