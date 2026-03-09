/**
 * Chat Context Tests (JOV-943)
 * Deterministic testing architecture: session initialization.
 *
 * These tests verify that the chat session receives the correct artist context
 * (profile data, full discography, DSP stats) on initialization. The system
 * prompt is the canonical serialization point for this data.
 */

import { describe, expect, it } from 'vitest';

import { buildSystemPrompt } from '@/lib/chat/system-prompt';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockArtistContext = {
  displayName: 'Nova Bloom',
  username: 'novabloom',
  bio: 'Indie pop artist from Chicago.',
  genres: ['indie', 'pop', 'synth-pop'],
  spotifyFollowers: 8400,
  spotifyPopularity: 38,
  spotifyUrl: 'https://open.spotify.com/artist/novatest',
  appleMusicUrl: 'https://music.apple.com/artist/novatest',
  profileViews: 1520,
  hasSocialLinks: true,
  hasMusicLinks: true,
  tippingStats: {
    tipClicks: 14,
    tipsSubmitted: 3,
    totalReceivedCents: 4500,
    monthReceivedCents: 1200,
  },
};

const mockReleases = [
  {
    title: 'Bloom EP',
    releaseType: 'ep',
    releaseDate: '2025-04-10T00:00:00Z',
    totalTracks: 5,
  },
  {
    title: 'Daydream',
    releaseType: 'single',
    releaseDate: '2025-08-22T00:00:00Z',
    totalTracks: 1,
  },
  {
    title: 'Early Signals',
    releaseType: 'album',
    releaseDate: '2024-11-15T00:00:00Z',
    totalTracks: 12,
  },
];

// ---------------------------------------------------------------------------
// Session context injection tests
// ---------------------------------------------------------------------------

describe('Chat session context: full artist profile', () => {
  it('includes artist display name and username in prompt', () => {
    const prompt = buildSystemPrompt(mockArtistContext, mockReleases);
    expect(prompt).toContain('Nova Bloom');
    expect(prompt).toContain('@novabloom');
  });

  it('includes bio text in prompt', () => {
    const prompt = buildSystemPrompt(mockArtistContext, mockReleases);
    expect(prompt).toContain('Indie pop artist from Chicago.');
  });

  it('includes all genres in prompt', () => {
    const prompt = buildSystemPrompt(mockArtistContext, mockReleases);
    expect(prompt).toContain('indie');
    expect(prompt).toContain('pop');
    expect(prompt).toContain('synth-pop');
  });

  it('includes Spotify follower count in prompt', () => {
    const prompt = buildSystemPrompt(mockArtistContext, mockReleases);
    expect(prompt).toContain('8,400');
  });

  it('includes Spotify popularity score in prompt', () => {
    const prompt = buildSystemPrompt(mockArtistContext, mockReleases);
    expect(prompt).toContain('38');
  });

  it('includes profile view count in prompt', () => {
    const prompt = buildSystemPrompt(mockArtistContext, mockReleases);
    expect(prompt).toContain('1,520');
  });

  it('includes tipping stats with formatted dollar amounts', () => {
    const prompt = buildSystemPrompt(mockArtistContext, mockReleases);
    // $45.00 total, $12.00 month
    expect(prompt).toContain('$45.00');
    expect(prompt).toContain('$12.00');
  });

  it('includes social and music link presence flags', () => {
    const prompt = buildSystemPrompt(mockArtistContext, mockReleases);
    expect(prompt).toMatch(/Has Social Links:.*Yes/);
    expect(prompt).toMatch(/Has Music Links.*Yes/);
  });
});

describe('Chat session context: full discography', () => {
  it('includes total release count', () => {
    const prompt = buildSystemPrompt(mockArtistContext, mockReleases);
    expect(prompt).toContain('Total Releases:');
    expect(prompt).toContain('3');
  });

  it('includes all release titles', () => {
    const prompt = buildSystemPrompt(mockArtistContext, mockReleases);
    expect(prompt).toContain('Bloom EP');
    expect(prompt).toContain('Daydream');
    expect(prompt).toContain('Early Signals');
  });

  it('includes release types for each release', () => {
    const prompt = buildSystemPrompt(mockArtistContext, mockReleases);
    expect(prompt).toContain('ep');
    expect(prompt).toContain('single');
    expect(prompt).toContain('album');
  });

  it('includes track counts for each release', () => {
    const prompt = buildSystemPrompt(mockArtistContext, mockReleases);
    expect(prompt).toContain('5 tracks');
    expect(prompt).toContain('1 track');
    expect(prompt).toContain('12 tracks');
  });

  it('includes release dates (YYYY-MM-DD format) for dated releases', () => {
    const prompt = buildSystemPrompt(mockArtistContext, mockReleases);
    expect(prompt).toContain('2025-04-10');
    expect(prompt).toContain('2025-08-22');
    expect(prompt).toContain('2024-11-15');
  });

  it('shows "No releases found" fallback when discography is empty', () => {
    const prompt = buildSystemPrompt(mockArtistContext, []);
    expect(prompt).toContain(
      'No releases found in the connected discography yet.'
    );
    expect(prompt).toContain('Total Releases:');
    expect(prompt).toContain('0');
  });

  it('caps discography at 25 entries with overflow indicator', () => {
    const largeDiscography = Array.from({ length: 30 }, (_, i) => ({
      title: `Track ${i + 1}`,
      releaseType: 'single',
      releaseDate: '2025-01-01T00:00:00Z',
      totalTracks: 1,
    }));

    const prompt = buildSystemPrompt(mockArtistContext, largeDiscography);
    expect(prompt).toContain('Track 1');
    expect(prompt).toContain('Track 25');
    expect(prompt).not.toContain('Track 26');
    expect(prompt).toContain('5 more release');
  });
});

describe('Chat session context: null/missing field handling', () => {
  it('shows "Not set" when bio is null', () => {
    const ctx = { ...mockArtistContext, bio: null };
    const prompt = buildSystemPrompt(ctx, mockReleases);
    expect(prompt).toContain('Not set');
  });

  it('shows "Not specified" when genres array is empty', () => {
    const ctx = { ...mockArtistContext, genres: [] };
    const prompt = buildSystemPrompt(ctx, mockReleases);
    expect(prompt).toContain('Not specified');
  });

  it('shows "Not connected" when Spotify followers is null', () => {
    const ctx = { ...mockArtistContext, spotifyFollowers: null };
    const prompt = buildSystemPrompt(ctx, mockReleases);
    expect(prompt).toContain('Not connected');
  });

  it('shows "No" for link flags when hasSocialLinks is false', () => {
    const ctx = {
      ...mockArtistContext,
      hasSocialLinks: false,
      hasMusicLinks: false,
    };
    const prompt = buildSystemPrompt(ctx, mockReleases);
    expect(prompt).toMatch(/Has Social Links:.*No/);
    expect(prompt).toMatch(/Has Music Links.*No/);
  });

  it('handles release with null releaseDate gracefully', () => {
    const releasesWithNull = [
      {
        title: 'Undated Single',
        releaseType: 'single',
        releaseDate: null,
        totalTracks: 1,
      },
    ];
    const prompt = buildSystemPrompt(mockArtistContext, releasesWithNull);
    expect(prompt).toContain('Undated Single');
    // No date should appear in the release line
    expect(prompt).toContain('(single, 1 track)');
  });
});

describe('Chat session context: plan limitations', () => {
  it('includes free tier message limit when tools are restricted', () => {
    const prompt = buildSystemPrompt(mockArtistContext, mockReleases, {
      aiCanUseTools: false,
      aiDailyMessageLimit: 5,
    });
    expect(prompt).toContain('5 messages per day');
    expect(prompt).toContain('Free');
  });

  it('omits plan limitations section when artist has Pro access', () => {
    const prompt = buildSystemPrompt(mockArtistContext, mockReleases, {
      aiCanUseTools: true,
      aiDailyMessageLimit: 200,
    });
    expect(prompt).not.toContain('Plan Limitations');
  });

  it('omits plan limitations when no options are provided', () => {
    const prompt = buildSystemPrompt(mockArtistContext, mockReleases);
    expect(prompt).not.toContain('Plan Limitations');
  });
});
