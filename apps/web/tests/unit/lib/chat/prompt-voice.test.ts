import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  ONBOARDING_CALIBRATION_EXAMPLES,
  ONBOARDING_SYSTEM_PROMPT,
} from '@/lib/chat/prompts/onboarding';
import { lintVoice } from '@/lib/chat/voice-lint';

/**
 * The prompts themselves contain the NEVER lists (banned words by design),
 * so voice compliance is asserted on the calibration examples — the copy
 * the model is told to imitate — not on the raw prompt text.
 */
describe('onboarding prompt voice (JOV-3806)', () => {
  it.each(
    Object.entries(ONBOARDING_CALIBRATION_EXAMPLES)
  )('calibration example %s passes the Jovie voice lint', (_name, text) => {
    expect(lintVoice(text).violations).toEqual([]);
  });

  it('wires every calibration example into the live prompt', () => {
    for (const text of Object.values(ONBOARDING_CALIBRATION_EXAMPLES)) {
      expect(ONBOARDING_SYSTEM_PROMPT).toContain(text);
    }
  });

  it('anchors the persona canon (operator, warm to musicians)', () => {
    expect(ONBOARDING_SYSTEM_PROMPT).toMatch(/warm to musicians/i);
    expect(ONBOARDING_SYSTEM_PROMPT).toMatch(/ruthless to bad systems/i);
  });

  it('bans sloppy closers and unsupported audience claims', () => {
    expect(ONBOARDING_SYSTEM_PROMPT).toMatch(/Fire\. That's the play/i);
    expect(ONBOARDING_SYSTEM_PROMPT).toMatch(/Catch you on the flip side/i);
    expect(ONBOARDING_SYSTEM_PROMPT).toMatch(/totally dark/i);
    expect(ONBOARDING_SYSTEM_PROMPT).toMatch(/probably goes nowhere useful/i);
    expect(ONBOARDING_SYSTEM_PROMPT).toMatch(/this artist/i);
    expect(ONBOARDING_SYSTEM_PROMPT).toMatch(/source: enrichment/i);
    expect(ONBOARDING_SYSTEM_PROMPT).toMatch(/Never claim Jovie notifies/i);
  });

  it('keeps post-Spotify calibration non-ownership and source-cited', () => {
    expect(ONBOARDING_CALIBRATION_EXAMPLES.afterSpotifyPick).toMatch(
      /this artist/i
    );
    expect(ONBOARDING_CALIBRATION_EXAMPLES.afterSpotifyPick).toMatch(
      /source: enrichment/i
    );
    expect(ONBOARDING_CALIBRATION_EXAMPLES.afterSpotifyPick).not.toMatch(
      /Pulled you up/i
    );
  });
});

describe('authenticated chat prompt voice', () => {
  it('anchors the persona canon in the app system prompt', async () => {
    const { buildSystemPrompt } = await import('@/lib/chat/system-prompt');
    const prompt = buildSystemPrompt(
      {
        displayName: 'Test Artist',
        username: 'testartist',
        bio: null,
        genres: [],
        spotifyFollowers: null,
        spotifyPopularity: null,
        profileViews: 0,
        hasSocialLinks: false,
        hasMusicLinks: false,
        tippingStats: {
          tipClicks: 0,
          tipsSubmitted: 0,
          totalReceivedCents: 0,
          monthReceivedCents: 0,
        },
      },
      [],
      { aiCanUseTools: true, aiDailyMessageLimit: 10 }
    );
    expect(prompt).toContain('warm to musicians, ruthless to bad systems');
    expect(prompt).toContain('No emoji');
  });
});
