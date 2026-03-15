import { describe, expect, it } from 'vitest';
import { isAllowedAvatarHostname } from '@/lib/images/avatar-hosts';

describe('isAllowedAvatarHostname', () => {
  it('allows known direct hosts', () => {
    expect(isAllowedAvatarHostname('i.scdn.co')).toBe(true);
    expect(isAllowedAvatarHostname('img.clerk.com')).toBe(true);
    expect(isAllowedAvatarHostname('cdn.linktr.ee')).toBe(true);
  });

  it('allows wildcard subdomains for supported CDNs', () => {
    expect(isAllowedAvatarHostname('lineup-images.scdn.co')).toBe(true);
    expect(isAllowedAvatarHostname('wrapped-images.spotifycdn.com')).toBe(true);
    expect(isAllowedAvatarHostname('pbs.twimg.com')).toBe(true);
    expect(isAllowedAvatarHostname('lh3.googleusercontent.com')).toBe(true);
    expect(isAllowedAvatarHostname('platform-lookaside.fbsbx.com')).toBe(true);
  });

  it('rejects lookalike attacker domains', () => {
    expect(isAllowedAvatarHostname('i.scdn.co.attacker.com')).toBe(false);
    expect(isAllowedAvatarHostname('evil.spotifycdn.com.attacker.com')).toBe(
      false
    );
  });
});
