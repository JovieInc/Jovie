import { describe, expect, it } from 'vitest';
import type { WaitlistRequestPayload } from '@/lib/validation/schemas';
import {
  INTERVIEW_ADMIT_THRESHOLD,
  scoreOnboardingInterview,
} from '@/lib/waitlist/interview-scoring';

const basePayload = {
  primaryGoal: null,
  primarySocialUrl: 'https://instagram.com/example',
  spotifyUrl: null,
  spotifyArtistName: null,
  heardAbout: null,
  selectedPlan: null,
} satisfies WaitlistRequestPayload;

describe('scoreOnboardingInterview', () => {
  it('admits a high-intent artist with Spotify identity, active release, and a real problem statement', () => {
    const result = scoreOnboardingInterview({
      payload: {
        ...basePayload,
        spotifyUrl: 'https://open.spotify.com/artist/abc123',
        spotifyArtistName: 'Example Artist',
      },
      responses: {
        currentWorkflow: 'Releasing a single next month with a small tour',
        biggestBlocker:
          'Coordinating pre-save links and fan follow-up takes me days every release',
        launchGoal: 'Get the rollout automated end to end',
      },
    });

    expect(result.admit).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(INTERVIEW_ADMIT_THRESHOLD);
    expect(result.signals).toContain('spotify_artist_identity');
    expect(result.signals).toContain('active_release_language');
    expect(result.signals).toContain('substantive_problem_statement');
  });

  it('waitlists an empty or low-signal submission', () => {
    const result = scoreOnboardingInterview({
      payload: basePayload,
      responses: {
        currentWorkflow: 'stuff',
        biggestBlocker: 'idk',
        launchGoal: null,
      },
    });

    expect(result.admit).toBe(false);
    expect(result.score).toBeLessThan(INTERVIEW_ADMIT_THRESHOLD);
    expect(result.signals).toHaveLength(0);
  });

  it('gives partial credit for a Spotify URL without an artist name', () => {
    const withName = scoreOnboardingInterview({
      payload: {
        ...basePayload,
        spotifyUrl: 'https://open.spotify.com/artist/abc123',
        spotifyArtistName: 'Example Artist',
      },
      responses: {},
    });
    const withoutName = scoreOnboardingInterview({
      payload: {
        ...basePayload,
        spotifyUrl: 'https://open.spotify.com/artist/abc123',
      },
      responses: {},
    });

    expect(withName.score).toBeGreaterThan(withoutName.score);
    expect(withoutName.signals).toContain('spotify_url');
    expect(withoutName.signals).not.toContain('spotify_artist_identity');
  });

  it('counts paid plan interest and role language as signal', () => {
    const result = scoreOnboardingInterview({
      payload: { ...basePayload, selectedPlan: 'pro' },
      responses: {
        currentWorkflow: 'I manage three artists at an indie label',
      },
    });

    expect(result.signals).toContain('paid_plan_interest');
    expect(result.signals).toContain('high_intent_role');
  });

  it('never scores above 100 and stays deterministic', () => {
    const input = {
      payload: {
        ...basePayload,
        spotifyUrl: 'https://open.spotify.com/artist/abc123',
        spotifyArtistName: 'Example Artist',
        selectedPlan: 'pro',
        heardAbout: 'A producer friend',
      },
      responses: {
        currentWorkflow: 'Album rollout with a festival tour as an artist',
        biggestBlocker:
          'Keeping every DSP profile, smart link, and merch drop in sync',
        launchGoal: 'Automate the release checklist',
      },
    } as const;

    const first = scoreOnboardingInterview(input);
    const second = scoreOnboardingInterview(input);

    expect(first.score).toBeLessThanOrEqual(100);
    expect(first).toEqual(second);
  });
});
