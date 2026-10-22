import { describe, expect, it } from 'vitest';
import {
  buildLegacyAliasHoldCookie,
  isSafeRenamedAliasLocation,
  readLegacyAliasHash,
} from './legacy-profile-alias-redirects';

describe('legacy profile alias recovery helpers', () => {
  it('reads only real alias hashes', () => {
    expect(readLegacyAliasHash('#alias=listen')).toBe('listen');
    expect(readLegacyAliasHash('#alias=tip&utm=1')).toBe('tip');
    expect(readLegacyAliasHash('#alias=future-nostalgia')).toBeNull();
    expect(readLegacyAliasHash('')).toBeNull();
  });

  it('holds the colliding URL open without a scriptable path', () => {
    expect(buildLegacyAliasHoldCookie('dualipa', 'music', true)).toBe(
      'jovie_alias_content=1; Path=/dualipa/music; Max-Age=300; SameSite=Lax; Secure'
    );
    expect(buildLegacyAliasHoldCookie('dualipa', 'music', false)).not.toContain(
      'Secure'
    );
    expect(buildLegacyAliasHoldCookie('../app', 'releases', true)).toBeNull();
    expect(
      buildLegacyAliasHoldCookie('dualipa', 'future-nostalgia', true)
    ).toBe(null);
  });

  it('rejects renamed locations that leave the profile', () => {
    expect(isSafeRenamedAliasLocation('/dualipa/renamed-music')).toBe(true);
    expect(isSafeRenamedAliasLocation('//evil.example/dualipa')).toBe(false);
    expect(isSafeRenamedAliasLocation('/dualipa/music?alias-content=1')).toBe(
      false
    );
    expect(isSafeRenamedAliasLocation('/dualipa/music/extra')).toBe(false);
  });
});
