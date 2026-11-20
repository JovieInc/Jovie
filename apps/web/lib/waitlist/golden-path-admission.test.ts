import { describe, expect, it } from 'vitest';
import { decideGoldenPathAdmission } from './golden-path-admission';

const resolved = {
  spotifyArtistId: '4Uwpa6zW3zzCSQvooQNksm',
  reach: 3_200,
  goldenPathVerdict: 'ELIGIBLE' as const,
};

describe('decideGoldenPathAdmission', () => {
  it('admits a resolved, non-high-profile artist while the golden path is green', () => {
    expect(decideGoldenPathAdmission(resolved)).toEqual({
      admit: true,
      reason: 'admit_resolved_artist',
    });
  });

  it('holds when identity is not resolved, whatever else is true', () => {
    expect(
      decideGoldenPathAdmission({ ...resolved, spotifyArtistId: null })
    ).toEqual({ admit: false, reason: 'hold_identity_unresolved' });
  });

  it('holds when reach is unknown (fail closed)', () => {
    expect(decideGoldenPathAdmission({ ...resolved, reach: null })).toEqual({
      admit: false,
      reason: 'hold_reach_unknown',
    });
    expect(
      decideGoldenPathAdmission({ ...resolved, reach: Number.NaN }).admit
    ).toBe(false);
  });

  it('keeps the verification path for high-profile artists even when everything is green', () => {
    expect(
      decideGoldenPathAdmission({ ...resolved, reach: 50_000_000 })
    ).toEqual({ admit: false, reason: 'hold_high_profile_needs_verification' });
  });

  it.each(['BLOCKED', 'UNKNOWN', null] as const)(
    'holds when the golden path verdict is %s',
    verdict => {
      expect(
        decideGoldenPathAdmission({ ...resolved, goldenPathVerdict: verdict })
      ).toEqual({ admit: false, reason: 'hold_golden_path_not_green' });
    }
  );
});
