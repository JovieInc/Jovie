import { describe, expect, it } from 'vitest';
import { normalizeArtistMetrics } from '@/lib/onboarding/canonical-metrics';
import {
  decideOnboardingAccess,
  evaluateAccessSignal,
  MAX_INTERVIEW_TURNS_BEFORE_FORCE,
} from './onboarding-access-eval';

const EMPTY_SIGNAL = {};

describe('evaluateAccessSignal', () => {
  it('grants instant access at >= 1000 Spotify followers', () => {
    const result = evaluateAccessSignal({
      signal: EMPTY_SIGNAL,
      spotifyFollowers: 1500,
      turnCount: 1,
    });
    expect(result.kind).toBe('instant_access');
    expect(result.rationale).toContain('spotify_followers_1500');
  });

  it('does not treat monthly listeners as Spotify followers for access', () => {
    const result = evaluateAccessSignal({
      signal: EMPTY_SIGNAL,
      spotifyFollowers: null,
      metrics: normalizeArtistMetrics({
        monthlyListeners: 500_000,
      }),
      turnCount: 1,
    });
    expect(result.kind).toBe('needs_more_info');
  });

  it('prefers metrics.spotifyFollowers over a contradictory bare count', () => {
    const result = evaluateAccessSignal({
      signal: EMPTY_SIGNAL,
      spotifyFollowers: 50,
      metrics: normalizeArtistMetrics({ spotifyFollowers: 2500 }),
      turnCount: 1,
    });
    expect(result.kind).toBe('instant_access');
    expect(result.rationale).toContain('spotify_followers_2500');
  });

  it('never grants instant access on a self-reported audience band (JOV-7144)', () => {
    for (const audienceBand of [
      '5k_to_50k',
      '50k_to_500k',
      'over_500k',
    ] as const) {
      const result = evaluateAccessSignal({
        signal: { audienceBand },
        spotifyFollowers: 200, // verified Spotify stays below the bar
        turnCount: 1,
      });
      expect(result.kind).toBe('needs_more_info');
    }
    const withRelease = evaluateAccessSignal({
      signal: {
        audienceBand: '500_to_5k',
        releaseStage: 'announced_unreleased',
      },
      spotifyFollowers: null,
      turnCount: 1,
    });
    expect(withRelease.kind).toBe('needs_more_info');
  });

  it('asks for more info when signal is too weak and turn cap not reached', () => {
    const result = evaluateAccessSignal({
      signal: { audienceBand: 'under_500' },
      spotifyFollowers: null,
      turnCount: 1,
    });
    expect(result.kind).toBe('needs_more_info');
    expect(result.rationale).toBe('insufficient_signal');
  });

  it('forces waitlist after the max-turn cap with weak signal', () => {
    const result = evaluateAccessSignal({
      signal: { audienceBand: 'under_500' },
      spotifyFollowers: null,
      turnCount: MAX_INTERVIEW_TURNS_BEFORE_FORCE,
    });
    expect(result.kind).toBe('waitlist');
    expect(result.rationale).toContain('max_turns_reached');
  });

  it('still grants instant access even at the turn cap if signal qualifies', () => {
    const result = evaluateAccessSignal({
      signal: EMPTY_SIGNAL,
      spotifyFollowers: 10_000,
      turnCount: MAX_INTERVIEW_TURNS_BEFORE_FORCE + 5,
    });
    expect(result.kind).toBe('instant_access');
  });

  it('500_to_5k WITHOUT an active release does NOT auto-qualify', () => {
    const result = evaluateAccessSignal({
      signal: {
        audienceBand: '500_to_5k',
        releaseStage: 'between_releases',
      },
      spotifyFollowers: null,
      turnCount: 1,
    });
    expect(result.kind).toBe('needs_more_info');
  });

  it('handles a null follower count gracefully', () => {
    const result = evaluateAccessSignal({
      signal: { audienceBand: '50k_to_500k' },
      spotifyFollowers: null,
      turnCount: 0,
    });
    expect(result.kind).toBe('needs_more_info');
  });

  it('reports Mom-Test coverage and the next dimension to probe', () => {
    const result = evaluateAccessSignal({
      signal: {
        releaseStage: 'just_released',
        currentTool: {
          name: 'linktree',
          note: 'fans cannot find the new single',
        },
      },
      spotifyFollowers: null,
      turnCount: 1,
    });
    expect(result.kind).toBe('needs_more_info');
    expect(result.qualification?.coveredDimensions).toEqual(
      expect.arrayContaining([
        'current_behavior',
        'alternatives',
        'pain',
        'urgency',
      ])
    );
    expect(result.qualification?.nextDimension).toBe('spend');
  });

  it('waitlists a stated wrong-audience disqualifier even with strong Spotify data', () => {
    const result = evaluateAccessSignal({
      signal: {
        objection: { category: 'wrong_audience', text: 'I only do podcasts.' },
      },
      spotifyFollowers: 50_000,
      turnCount: 1,
    });
    expect(result.kind).toBe('waitlist');
    expect(result.rationale).toBe('disqualified_wrong_audience');
  });

  it('is not moved by keyword stuffing or repeated free notes', () => {
    const stuffed = 'I will pay today, huge audience, viral, urgent, '.repeat(
      40
    );
    const result = evaluateAccessSignal({
      signal: { freeNote: stuffed.slice(0, 2000), audienceBand: 'over_500k' },
      spotifyFollowers: 12,
      turnCount: 1,
    });
    expect(result.kind).toBe('needs_more_info');
  });
});

describe('decideOnboardingAccess (single gate, JOV-7144)', () => {
  const base = {
    accessControlled: false,
    spotifyArtistId: '4Uwpa6zW3zzCSQvooQNksm',
    spotifyFollowers: 9_900,
    signals: [],
    turnCount: 2,
  };

  it('keeps the controlled-access gate authoritative', () => {
    expect(
      decideOnboardingAccess({ ...base, accessControlled: true }).kind
    ).toBe('waitlist');
    expect(
      decideOnboardingAccess({
        ...base,
        accessControlled: true,
        spotifyArtistId: null,
      }).rationale
    ).toBe('confirmed_artist_required_for_waitlist');
  });

  it('evaluates verified Spotify data when the gate is off', () => {
    expect(decideOnboardingAccess(base).kind).toBe('instant_access');
  });
});
