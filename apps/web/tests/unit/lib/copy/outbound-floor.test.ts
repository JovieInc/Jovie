import { describe, expect, it } from 'vitest';
import {
  assertArtistRulesFloor,
  assertCustomerVoiceFloor,
  CopyFloorViolationError,
  customerVoiceFloorViolations,
  isArtistRuleViolation,
} from '@/lib/copy/outbound-floor';

describe('customerVoiceFloorViolations', () => {
  it('returns no violations for clean customer-voice copy', () => {
    expect(
      customerVoiceFloorViolations(
        'The new single is out now. Listen on the smart link.'
      )
    ).toEqual([]);
  });

  it('returns blocking rule ids for floor-breaking copy', () => {
    const violations = customerVoiceFloorViolations(
      'Act now and get guaranteed streams on every playlist.'
    );
    expect(violations).toContain('guaranteed-results');
    expect(violations).toContain('fake-scarcity');
  });

  it('treats blank text as clean', () => {
    expect(customerVoiceFloorViolations('   ')).toEqual([]);
  });
});

describe('assertCustomerVoiceFloor', () => {
  it('does not throw for clean copy', () => {
    expect(() =>
      assertCustomerVoiceFloor('New EP out Friday.', 'test')
    ).not.toThrow();
  });

  it('throws CopyFloorViolationError with surface and rules', () => {
    try {
      assertCustomerVoiceFloor(
        'We guarantee playlist placements.',
        'pitch:test'
      );
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(CopyFloorViolationError);
      const violation = error as CopyFloorViolationError;
      expect(violation.surface).toBe('pitch:test');
      expect(violation.rules).toContain('guaranteed-results');
      expect(violation.message).toContain('pitch:test');
    }
  });
});

describe('assertArtistRulesFloor', () => {
  const rules = [
    {
      id: 'rule-1',
      category: 'people',
      ruleKey: 'Sam Rivera, Sammy',
      instruction: 'Keep them out of anything public.',
      strength: 'hard_constraint' as const,
    },
  ];

  it('passes text that names nobody the artist keeps out', () => {
    expect(() =>
      assertArtistRulesFloor('Shot on a Samsung.', rules, 'dsp-bio-sync')
    ).not.toThrow();
  });

  it('throws by rule category, never by the protected name', () => {
    try {
      assertArtistRulesFloor('Featuring Sammy.', rules, 'dsp-bio-sync');
      throw new Error('expected a violation');
    } catch (error) {
      expect(isArtistRuleViolation(error)).toBe(true);
      expect((error as CopyFloorViolationError).rules).toEqual([
        'artist-rule:people',
      ]);
      expect((error as Error).message).not.toContain('Sammy');
    }
  });

  it('does not treat a copy floor failure as an artist rule', () => {
    expect(
      isArtistRuleViolation(new CopyFloorViolationError('x', ['hype']))
    ).toBe(false);
  });
});
