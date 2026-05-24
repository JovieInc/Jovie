import { describe, expect, it } from 'vitest';
import {
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

  it('grants instant access at audience band 5k_to_50k', () => {
    const result = evaluateAccessSignal({
      signal: { audienceBand: '5k_to_50k' },
      spotifyFollowers: 200, // below threshold
      turnCount: 1,
    });
    expect(result.kind).toBe('instant_access');
    expect(result.rationale).toContain('audience_band_5k_to_50k');
  });

  it('grants instant access at 500_to_5k IF an active release is in flight', () => {
    const result = evaluateAccessSignal({
      signal: {
        audienceBand: '500_to_5k',
        releaseStage: 'announced_unreleased',
      },
      spotifyFollowers: null,
      turnCount: 1,
    });
    expect(result.kind).toBe('instant_access');
    expect(result.rationale).toContain('active_release');
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
    expect(result.kind).toBe('instant_access');
  });
});
