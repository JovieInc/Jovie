import { describe, expect, it } from 'vitest';
import { normalizeArtistMetrics } from '@/lib/onboarding/canonical-metrics';
import {
  decideOnboardingAccess,
  evaluateAccessSignal,
  MAX_INTERVIEW_TURNS_BEFORE_FORCE,
} from './onboarding-access-eval';

const EMPTY_SIGNAL = {};

describe('evaluateAccessSignal', () => {
  it('requires the interview even with a large Spotify audience', () => {
    const result = evaluateAccessSignal({
      signal: EMPTY_SIGNAL,
      spotifyFollowers: 1500,
      turnCount: 1,
    });
    expect(result.kind).toBe('needs_more_info');
    expect(result.rationale).toBe('past_behavior_required');
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

  it('does not use canonical Spotify metrics as a substitute for the ICP', () => {
    const result = evaluateAccessSignal({
      signal: EMPTY_SIGNAL,
      spotifyFollowers: 50,
      metrics: normalizeArtistMetrics({ spotifyFollowers: 2500 }),
      turnCount: 1,
    });
    expect(result.kind).toBe('needs_more_info');
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
    expect(result.rationale).toBe('past_behavior_required');
  });

  it('does not skip the interview after the turn cap', () => {
    const result = evaluateAccessSignal({
      signal: { audienceBand: 'under_500' },
      spotifyFollowers: null,
      turnCount: MAX_INTERVIEW_TURNS_BEFORE_FORCE,
    });
    expect(result.kind).toBe('needs_more_info');
    expect(result.rationale).toBe('past_behavior_required');
  });

  it('admits verified YouTube artists after their past-behavior answer', () => {
    const result = evaluateAccessSignal({
      signal: {
        pastBehavior:
          'I shared my last music video using my channel description.',
      },
      youtubeQualified: true,
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
    expect(result.kind).toBe('waitlist');
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
        pastBehavior: 'I posted my latest podcast on my website.',
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
    signals: [{ pastBehavior: 'I shared the last release using my website.' }],
    turnCount: 2,
  };

  it('waitlists non-ICP interviews with either global gate setting', () => {
    expect(
      decideOnboardingAccess({ ...base, accessControlled: true }).kind
    ).toBe('waitlist');
    expect(
      decideOnboardingAccess({
        ...base,
        accessControlled: true,
        spotifyArtistId: null,
      }).rationale
    ).toBe('public_profile_required_for_waitlist');
  });

  it('reserves non-artists who share any public profile link (Tim 2026-09-29)', () => {
    const decision = decideOnboardingAccess({
      ...base,
      accessControlled: true,
      spotifyArtistId: null,
      spotifyFollowers: null,
      publicProfileUrl: 'https://averychen.design',
    });
    expect(decision.kind).toBe('waitlist');
    expect(decision.rationale).toBe('youtube_artist_icp_required');
  });

  it('does not admit Spotify-only artists when the gate is off', () => {
    expect(decideOnboardingAccess(base).kind).toBe('waitlist');
  });
});

it('admits the verified YouTube ICP even while other segments are gated', () => {
  expect(
    decideOnboardingAccess({
      accessControlled: true,
      spotifyArtistId: 'artist',
      spotifyFollowers: 0,
      signals: [{ pastBehavior: 'I put the last video on my music channel.' }],
      turnCount: 2,
      youtubeQualified: true,
    }).kind
  ).toBe('instant_access');
});
