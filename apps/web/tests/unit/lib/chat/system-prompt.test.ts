import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from '@/lib/chat/system-prompt';

const baseContext = {
  displayName: 'The Artist',
  username: 'theartist',
  bio: 'Independent alt-pop artist',
  genres: ['alt-pop'],
  spotifyFollowers: 12345,
  spotifyPopularity: 57,
  profileViews: 876,
  hasSocialLinks: true,
  hasMusicLinks: true,
  tippingStats: {
    tipClicks: 10,
    tipsSubmitted: 2,
    totalReceivedCents: 1200,
    monthReceivedCents: 500,
  },
};

describe('buildSystemPrompt', () => {
  it('includes release count and release lines in discography context', () => {
    const prompt = buildSystemPrompt(baseContext, [
      {
        title: 'Midnight Signal',
        releaseType: 'single',
        releaseDate: '2025-06-01T00:00:00.000Z',
        totalTracks: 1,
      },
      {
        title: 'Color Theory',
        releaseType: 'ep',
        releaseDate: null,
        totalTracks: 5,
      },
    ]);

    expect(prompt).toContain('## Discography Context');
    expect(prompt).toContain('- **Total Releases:** 2');
    expect(prompt).toContain('- Midnight Signal (single, 2025-06-01, 1 track)');
    expect(prompt).toContain('- Color Theory (ep, 5 tracks)');
  });

  it('shows fallback line when no releases are available', () => {
    const prompt = buildSystemPrompt(baseContext, []);

    expect(prompt).toContain('- **Total Releases:** 0');
    expect(prompt).toContain(
      '- No releases found in the connected discography yet.'
    );
  });

  it('includes the analytics tool guidance when insights are enabled', () => {
    const prompt = buildSystemPrompt(baseContext, [], {
      aiCanUseTools: true,
      aiDailyMessageLimit: 25,
      insightsEnabled: true,
    });

    expect(prompt).toContain("call the 'showTopInsights' tool first");
  });

  it('does not instruct the model to call analytics tools when insights are disabled', () => {
    const prompt = buildSystemPrompt(baseContext, [], {
      aiCanUseTools: true,
      aiDailyMessageLimit: 25,
      insightsEnabled: false,
    });

    expect(prompt).not.toContain("call the 'showTopInsights' tool first");
    expect(prompt).toContain(
      'you do not have access to insight cards in this session'
    );
  });
});
