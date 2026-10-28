import { describe, expect, it } from 'vitest';

import {
  checkAgainstBase,
  checkRatchet,
  inScope,
  scanSource,
  sideEffectGapsOf,
} from '../domain-write-guard.mjs';

const tables = {
  creatorProfiles: 'creator_profiles',
  socialLinks: 'social_links',
};
const registry = {
  domains: [{ module: 'apps/web/lib/services/profile/mutations.ts' }],
};

describe('domain-write-guard scanner', () => {
  it('counts drizzle writes per core table, including schema-qualified and multiline', () => {
    const text = `
      await db.update(creatorProfiles).set({});
      await tx.insert(\n  schema.socialLinks\n).values({});
      await db.delete(socialLinks).where(x);
      await db.select().from(creatorProfiles);`;
    expect(scanSource(text, tables)).toEqual({
      creatorProfiles: 1,
      socialLinks: 2,
    });
  });

  it('counts raw sql writes but not prose', () => {
    expect(
      scanSource('sql`UPDATE creator_profiles SET a = 1`', tables)
    ).toEqual({
      creatorProfiles: 1,
    });
    expect(scanSource('// we update creator profiles here', tables)).toEqual(
      {}
    );
  });

  it('exempts registered domain modules, tests, migrations and non-web paths', () => {
    expect(
      inScope('apps/web/lib/services/profile/mutations.ts', registry)
    ).toBe(false);
    expect(inScope('apps/web/lib/foo/bar.test.ts', registry)).toBe(false);
    expect(inScope('apps/web/drizzle/0001.ts', registry)).toBe(false);
    expect(inScope('scripts/x.mjs', registry)).toBe(false);
    expect(inScope('apps/web/app/api/foo/route.ts', registry)).toBe(true);
  });

  it('fails on new files and growth, reports shrinkage as stale', () => {
    const ratchet = { 'a.ts': { socialLinks: 2 } };
    expect(
      checkRatchet({ 'a.ts': { socialLinks: 3 } }, ratchet).errors
    ).toHaveLength(1);
    expect(
      checkRatchet({ 'b.ts': { socialLinks: 1 } }, ratchet).errors
    ).toHaveLength(1);
    const shrunk = checkRatchet({ 'a.ts': { socialLinks: 1 } }, ratchet);
    expect(shrunk.errors).toEqual([]);
    expect(shrunk.stale).toHaveLength(1);
    expect(
      checkRatchet({ 'a.ts': { socialLinks: 2 } }, ratchet).errors
    ).toEqual([]);
  });

  it('requires a cache-invalidation side effect on social link writers', () => {
    const effects = { socialLinks: ['invalidateSocialLinksCache'] };
    expect(
      sideEffectGapsOf('db.update(socialLinks)', { socialLinks: 1 }, effects)
    ).toEqual(['socialLinks']);
    expect(
      sideEffectGapsOf(
        'db.update(socialLinks); await invalidateSocialLinksCache(p, u)',
        { socialLinks: 1 },
        effects
      )
    ).toEqual([]);
    const gap = { 'x.ts': ['socialLinks'] };
    expect(checkRatchet({}, {}, gap, {}).errors).toHaveLength(1);
    expect(checkRatchet({}, {}, gap, gap).errors).toEqual([]);
  });

  it('rejects a PR that raises or adds ratchet entries against the base', () => {
    const base = {
      entries: { 'a.ts': { socialLinks: 2 } },
      sideEffectGaps: {},
    };
    expect(
      checkAgainstBase({ entries: { 'a.ts': { socialLinks: 2 } } }, base)
    ).toEqual([]);
    expect(
      checkAgainstBase({ entries: { 'a.ts': { socialLinks: 3 } } }, base)
    ).toHaveLength(1);
    expect(
      checkAgainstBase({ entries: { 'b.ts': { socialLinks: 1 } } }, base)
    ).toHaveLength(1);
    expect(
      checkAgainstBase(
        { entries: {}, sideEffectGaps: { 'c.ts': ['socialLinks'] } },
        base
      )
    ).toHaveLength(1);
    expect(
      checkAgainstBase({ entries: { 'z.ts': { socialLinks: 9 } } }, null)
    ).toEqual([]);
  });
});
