import { describe, expect, it } from 'vitest';
import {
  type ArtistRule,
  authorizeArtistRuleException,
  compareArtistRulePrecedence,
  confirmArtistRule,
  evaluateArtistRules,
  proposeArtistRuleFromMemory,
} from '@/lib/artist-rules/engine';

function rule(
  overrides: Partial<ArtistRule> &
    Pick<ArtistRule, 'id' | 'domain' | 'kind' | 'status'>
): ArtistRule {
  return {
    creatorProfileId: 'profile-1',
    statement: overrides.statement ?? overrides.id,
    selector: overrides.selector ?? { actions: ['publish'] },
    provenance: {
      sourceType: 'manual',
      sourceId: null,
      confirmedBy: overrides.status === 'confirmed' ? 'user-1' : null,
      confirmedAt:
        overrides.status === 'confirmed' ? '2026-08-28T00:00:00.000Z' : null,
    },
    overrideable: overrides.domain === 'artist_preference',
    ...overrides,
  };
}

describe('artist rules', () => {
  it('does not enforce raw memory until confirmed, and ranks safety above preference', () => {
    const proposed = proposeArtistRuleFromMemory({
      id: 'mem',
      creatorProfileId: 'profile-1',
      statement: 'Keep verses dry',
      observationId: 'obs-1',
    });
    expect(proposed.status).toBe('proposed');
    expect(
      evaluateArtistRules([proposed], [], { action: 'publish' }).allowed
    ).toBe(true);

    const preference = confirmArtistRule(
      proposed,
      'user-1',
      '2026-08-28T00:00:00.000Z'
    );
    const safety = rule({
      id: 'safety',
      domain: 'safety',
      kind: 'hard_constraint',
      status: 'confirmed',
      statement: 'No unlicensed stems',
    });
    expect(compareArtistRulePrecedence(safety, preference)).toBeLessThan(0);
    expect(
      evaluateArtistRules([preference, safety], [], { action: 'publish' })
        .blockingRuleId
    ).toBe('safety');

    const exception = authorizeArtistRuleException({
      id: 'ex-1',
      rule: preference,
      scope: 'item',
      scopeId: 'video-1',
      authorizedBy: 'user-1',
      rationale: 'One-off live take',
    });
    expect(
      evaluateArtistRules([preference], [exception], {
        action: 'publish',
        itemId: 'video-1',
      }).skippedExceptionRuleIds
    ).toEqual(['mem']);
    expect(() =>
      authorizeArtistRuleException({
        id: 'ex-2',
        rule: safety,
        scope: 'item',
        scopeId: 'video-1',
        authorizedBy: 'user-1',
        rationale: 'Please',
      })
    ).toThrow(/overrideable/);
  });
});
