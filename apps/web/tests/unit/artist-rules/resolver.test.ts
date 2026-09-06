import { describe, expect, it } from 'vitest';
import {
  resolveArtistRuleSet,
  validateArtistRuleActivation,
  validateArtistRuleException,
} from '@/lib/artist-rules/resolver';
import type { ArtistRule } from '@/lib/db/schema/library-content-graph';

function rule(overrides: Partial<ArtistRule> = {}): ArtistRule {
  return {
    id: 'rule-1',
    creatorProfileId: 'profile-1',
    category: 'visual',
    ruleKey: 'primary_color',
    instruction: 'Make blue primary',
    strength: 'preference',
    scope: 'artist',
    scopeValue: null,
    allowOverride: true,
    status: 'active',
    provenance: {
      source: 'artist',
      capturedAt: '2026-08-28T00:00:00.000Z',
    },
    confirmedBy: 'user-1',
    confirmedAt: new Date('2026-08-28T00:00:00.000Z'),
    effectiveAt: new Date('2026-08-28T00:00:00.000Z'),
    expiresAt: null,
    supersedesRuleId: null,
    createdAt: new Date('2026-08-28T00:00:00.000Z'),
    updatedAt: new Date('2026-08-28T00:00:00.000Z'),
    ...overrides,
  };
}

describe('artist rule resolver', () => {
  it('does not activate an unconfirmed memory suggestion', () => {
    expect(
      validateArtistRuleActivation(
        rule({
          status: 'suggested',
          confirmedBy: null,
          confirmedAt: null,
          provenance: {
            source: 'memory',
            sourceId: 'memory-1',
            capturedAt: '2026-08-28T00:00:00.000Z',
          },
        })
      )
    ).toEqual({ ok: false, reason: 'missing_confirmation' });
  });

  it('rejects exceptions against non-overridable hard constraints', () => {
    expect(
      validateArtistRuleException(
        rule({ strength: 'hard_constraint', allowOverride: false }),
        {
          ruleId: 'rule-1',
          scope: 'item',
          scopeValue: 'video-1',
          authorUserId: 'user-1',
          reason: 'Campaign exception',
          evidence: { ticket: 'JOV-5362' },
          expiresAt: null,
        }
      )
    ).toEqual({ ok: false, reason: 'override_forbidden' });
  });

  it('keeps hard constraints above narrower soft preferences', () => {
    const hard = rule({
      id: 'hard',
      ruleKey: 'yellow',
      instruction: 'Never use yellow',
      strength: 'hard_constraint',
      allowOverride: false,
    });
    const soft = rule({
      id: 'soft',
      ruleKey: 'yellow',
      instruction: 'Use yellow for this release',
      scope: 'release',
      scopeValue: 'release-1',
    });

    const result = resolveArtistRuleSet({
      rules: [soft, hard],
      context: { releaseId: 'release-1' },
      now: new Date('2026-08-29T00:00:00.000Z'),
    });

    expect(result.effective.map(item => item.id)).toEqual(['hard']);
    expect(result.shadowed).toEqual([
      expect.objectContaining({
        rule: expect.objectContaining({ id: 'soft' }),
        byRuleId: 'hard',
        reason: 'hard_constraint',
      }),
    ]);
  });

  it('fails closed on conflicting rules at identical precedence', () => {
    const result = resolveArtistRuleSet({
      rules: [
        rule({ id: 'a', instruction: 'Use lowercase' }),
        rule({ id: 'b', instruction: 'Use title case' }),
      ],
      context: {},
      now: new Date('2026-08-29T00:00:00.000Z'),
    });

    expect(result.effective).toEqual([]);
    expect(result.conflicts).toEqual([
      {
        ruleKey: 'visual:primary_color',
        ruleIds: ['a', 'b'],
        reason: 'same_precedence',
      },
    ]);
  });
});
