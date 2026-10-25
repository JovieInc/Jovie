import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildLegacyAliasHoldCookie,
  isLegacyProfileAliasSlug,
  isSafeRenamedAliasLocation,
  LEGACY_PROFILE_ALIAS_CONTENT_COOKIE,
  LEGACY_PROFILE_ALIAS_HASH_KEY,
  LEGACY_PROFILE_ALIAS_SLUGS,
  readLegacyAliasHash,
} from './legacy-profile-alias-recovery';

const require = createRequire(import.meta.url);
const redirectModule = require('./legacy-profile-alias-redirects.js') as {
  readonly LEGACY_PROFILE_ALIAS_CONTENT_COOKIE: string;
  readonly LEGACY_PROFILE_ALIAS_HASH_KEY: string;
  readonly LEGACY_PROFILE_MODE_ALIAS_MODES: readonly (readonly [
    string,
    string,
  ])[];
  readonly buildLegacyAliasHoldCookie?: unknown;
};

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

  it('keeps recovery slugs and cookie names aligned with the edge redirects', () => {
    expect([...LEGACY_PROFILE_ALIAS_SLUGS]).toEqual(
      redirectModule.LEGACY_PROFILE_MODE_ALIAS_MODES.map(([slug]) => slug)
    );
    expect(LEGACY_PROFILE_ALIAS_CONTENT_COOKIE).toBe(
      redirectModule.LEGACY_PROFILE_ALIAS_CONTENT_COOKIE
    );
    expect(LEGACY_PROFILE_ALIAS_HASH_KEY).toBe(
      redirectModule.LEGACY_PROFILE_ALIAS_HASH_KEY
    );
    for (const [slug] of redirectModule.LEGACY_PROFILE_MODE_ALIAS_MODES) {
      expect(isLegacyProfileAliasSlug(slug)).toBe(true);
    }
    expect(redirectModule.buildLegacyAliasHoldCookie).toBeUndefined();
  });

  it('imports the ESM recovery module from the story client and decision route', () => {
    const routingDir = dirname(fileURLToPath(import.meta.url));
    const component = readFileSync(
      join(
        routingDir,
        '../../components/features/profile/AliasCollisionRecovery.tsx'
      ),
      'utf8'
    );
    const route = readFileSync(
      join(
        routingDir,
        '../../app/api/profile-alias-decision/[username]/[slug]/route.ts'
      ),
      'utf8'
    );
    const story = readFileSync(
      join(
        routingDir,
        '../../components/features/profile/AliasCollisionRecovery.stories.tsx'
      ),
      'utf8'
    );

    for (const source of [component, route]) {
      expect(source).toContain(
        "from '@/lib/routing/legacy-profile-alias-recovery'"
      );
      expect(source).not.toContain('legacy-profile-alias-redirects');
    }
    expect(story).toContain('AliasCollisionRecovery');
    expect(story).not.toContain('legacy-profile-alias-redirects');
  });
});
