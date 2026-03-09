import { describe, expect, it } from 'vitest';

import {
  type ArtistBioWriterInput,
  buildArtistBioDraft,
} from '@/lib/ai/artist-bio-writer';
import {
  createProfileEditTool,
  EDITABLE_FIELDS,
  type ProfileEditContext,
} from '@/lib/ai/tools/profile-edit';
import { buildSystemPrompt } from '@/lib/chat/system-prompt';

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const mockArtistContext = {
  displayName: 'Luna Waves',
  username: 'lunawaves',
  bio: 'Ambient electronic producer from Portland.',
  genres: ['ambient', 'electronic', 'downtempo'],
  spotifyFollowers: 12500,
  spotifyPopularity: 45,
  profileViews: 3200,
  hasSocialLinks: true,
  hasMusicLinks: true,
  tippingStats: {
    tipClicks: 42,
    tipsSubmitted: 8,
    totalReceivedCents: 15000,
    monthReceivedCents: 2500,
  },
};

const mockReleases = [
  {
    title: 'Tidal Drift',
    releaseType: 'album',
    releaseDate: '2025-06-15T00:00:00Z',
    totalTracks: 10,
  },
  {
    title: 'Neon Reef',
    releaseType: 'single',
    releaseDate: '2025-09-01T00:00:00Z',
    totalTracks: 1,
  },
  {
    title: 'Coral EP',
    releaseType: 'ep',
    releaseDate: '2025-03-20T00:00:00Z',
    totalTracks: 4,
  },
];

// ---------------------------------------------------------------------------
// System Prompt Tests
// ---------------------------------------------------------------------------

describe('buildSystemPrompt', () => {
  describe('session context injection', () => {
    it('includes artist display name and username', () => {
      const prompt = buildSystemPrompt(mockArtistContext, [...mockReleases]);
      expect(prompt).toContain('Luna Waves');
      expect(prompt).toContain('@lunawaves');
    });

    it('includes artist bio', () => {
      const prompt = buildSystemPrompt(mockArtistContext, [...mockReleases]);
      expect(prompt).toContain('Ambient electronic producer from Portland.');
    });

    it('includes genre list', () => {
      const prompt = buildSystemPrompt(mockArtistContext, [...mockReleases]);
      expect(prompt).toContain('ambient, electronic, downtempo');
    });

    it('includes streaming stats', () => {
      const prompt = buildSystemPrompt(mockArtistContext, [...mockReleases]);
      expect(prompt).toContain('12,500');
      expect(prompt).toContain('45');
    });

    it('includes profile views', () => {
      const prompt = buildSystemPrompt(mockArtistContext, [...mockReleases]);
      expect(prompt).toContain('3,200');
    });

    it('includes tipping stats with formatted currency', () => {
      const prompt = buildSystemPrompt(mockArtistContext, [...mockReleases]);
      expect(prompt).toContain('$150.00');
      expect(prompt).toContain('$25.00');
    });

    it('includes social link status', () => {
      const prompt = buildSystemPrompt(mockArtistContext, [...mockReleases]);
      expect(prompt).toContain('Has Social Links:');
      expect(prompt).toContain('Has Music Links');
    });
  });

  describe('release context in prompt', () => {
    it('includes release titles', () => {
      const prompt = buildSystemPrompt(mockArtistContext, [...mockReleases]);
      expect(prompt).toContain('Tidal Drift');
      expect(prompt).toContain('Neon Reef');
      expect(prompt).toContain('Coral EP');
    });

    it('includes release types and track counts', () => {
      const prompt = buildSystemPrompt(mockArtistContext, [...mockReleases]);
      expect(prompt).toContain('album');
      expect(prompt).toContain('10 tracks');
      expect(prompt).toContain('1 track');
      expect(prompt).toContain('4 tracks');
    });

    it('includes total release count', () => {
      const prompt = buildSystemPrompt(mockArtistContext, [...mockReleases]);
      expect(prompt).toContain('Total Releases:');
      expect(prompt).toContain('3');
    });

    it('handles empty releases array', () => {
      const prompt = buildSystemPrompt(mockArtistContext, []);
      expect(prompt).toContain('No releases found');
    });

    it('truncates release list beyond 25 entries', () => {
      const manyReleases = Array.from({ length: 30 }, (_, i) => ({
        title: `Release ${i + 1}`,
        releaseType: 'single' as const,
        releaseDate: '2025-01-01T00:00:00Z',
        totalTracks: 1,
      }));
      const prompt = buildSystemPrompt(mockArtistContext, manyReleases);
      expect(prompt).toContain('Release 1');
      expect(prompt).toContain('Release 25');
      expect(prompt).toContain('5 more release');
      expect(prompt).not.toContain('Release 26');
    });
  });

  describe('profile completeness indicators', () => {
    it('shows "Not set" when bio is null', () => {
      const contextNoBio = { ...mockArtistContext, bio: null };
      const prompt = buildSystemPrompt(contextNoBio, [...mockReleases]);
      expect(prompt).toContain('Not set');
    });

    it('shows "Not specified" when genres are empty', () => {
      const contextNoGenres = { ...mockArtistContext, genres: [] };
      const prompt = buildSystemPrompt(contextNoGenres, [...mockReleases]);
      expect(prompt).toContain('Not specified');
    });

    it('shows "Not connected" when spotifyFollowers is null', () => {
      const contextNoSpotify = {
        ...mockArtistContext,
        spotifyFollowers: null,
      };
      const prompt = buildSystemPrompt(contextNoSpotify, [...mockReleases]);
      expect(prompt).toContain('Not connected');
    });

    it('shows "No" for social links when none present', () => {
      const contextNoLinks = {
        ...mockArtistContext,
        hasSocialLinks: false,
        hasMusicLinks: false,
      };
      const prompt = buildSystemPrompt(contextNoLinks, [...mockReleases]);
      expect(prompt).toMatch(/Has Social Links:.*No/);
      expect(prompt).toMatch(/Has Music Links.*No/);
    });
  });

  describe('voice directives', () => {
    it('includes voice/behavior instructions', () => {
      const prompt = buildSystemPrompt(mockArtistContext, [...mockReleases]);
      expect(prompt).toContain('Voice');
      expect(prompt).toContain('concise');
    });

    it('mentions tool usage guidance', () => {
      const prompt = buildSystemPrompt(mockArtistContext, [...mockReleases]);
      expect(prompt).toContain('proposeProfileEdit');
    });

    it('mentions blocked fields', () => {
      const prompt = buildSystemPrompt(mockArtistContext, [...mockReleases]);
      expect(prompt).toContain('username');
      expect(prompt).toContain('settings page');
    });
  });

  describe('plan limitations', () => {
    it('includes free tier limits when tools are restricted', () => {
      const prompt = buildSystemPrompt(mockArtistContext, [...mockReleases], {
        aiCanUseTools: false,
        aiDailyMessageLimit: 10,
      });
      expect(prompt).toContain('Free');
      expect(prompt).toContain('10 messages per day');
    });

    it('omits plan limitations when tools are available', () => {
      const prompt = buildSystemPrompt(mockArtistContext, [...mockReleases], {
        aiCanUseTools: true,
        aiDailyMessageLimit: 100,
      });
      expect(prompt).not.toContain('Plan Limitations');
    });

    it('omits plan limitations when no options provided', () => {
      const prompt = buildSystemPrompt(mockArtistContext, [...mockReleases]);
      expect(prompt).not.toContain('Plan Limitations');
    });
  });
});

// ---------------------------------------------------------------------------
// Profile Edit Tool Tests (mocked LLM tool invocation)
// ---------------------------------------------------------------------------

describe('createProfileEditTool (mocked tool invocation)', () => {
  const profileContext: ProfileEditContext = {
    displayName: 'Luna Waves',
    bio: 'Ambient electronic producer from Portland.',
  };

  async function callTool(
    context: ProfileEditContext,
    args: { field: 'displayName' | 'bio'; newValue: string; reason?: string }
  ) {
    const editTool = createProfileEditTool(context);
    const result = await editTool.execute!(args, {
      toolCallId: `mock-${args.field}`,
      messages: [],
      abortSignal: new AbortController().signal,
    });
    return result as {
      success: boolean;
      preview: {
        field: string;
        fieldLabel: string;
        currentValue: string | null;
        newValue: string;
        reason: string | undefined;
      };
    };
  }

  it('returns correct preview for displayName edit', async () => {
    const result = await callTool(profileContext, {
      field: 'displayName',
      newValue: 'Luna Waves Official',
      reason: 'Brand consistency',
    });

    expect(result.success).toBe(true);
    expect(result.preview.field).toBe('displayName');
    expect(result.preview.currentValue).toBe('Luna Waves');
    expect(result.preview.newValue).toBe('Luna Waves Official');
    expect(result.preview.reason).toBe('Brand consistency');
  });

  it('returns correct preview for bio edit', async () => {
    const result = await callTool(profileContext, {
      field: 'bio',
      newValue: 'Updated bio text for testing.',
    });

    expect(result.success).toBe(true);
    expect(result.preview.field).toBe('bio');
    expect(result.preview.currentValue).toBe(
      'Ambient electronic producer from Portland.'
    );
    expect(result.preview.newValue).toBe('Updated bio text for testing.');
    expect(result.preview.reason).toBeUndefined();
  });

  it('handles null bio in context', async () => {
    const contextNoBio: ProfileEditContext = {
      displayName: 'Artist',
      bio: null,
    };
    const result = await callTool(contextNoBio, {
      field: 'bio',
      newValue: 'Brand new bio',
    });

    expect(result.preview.currentValue).toBeNull();
  });

  it('only allows tier1 editable fields', () => {
    expect(EDITABLE_FIELDS.tier1).toEqual(
      expect.arrayContaining(['displayName', 'bio'])
    );
    expect(EDITABLE_FIELDS.blocked).toEqual(
      expect.arrayContaining(['username', 'genres'])
    );
  });
});

// ---------------------------------------------------------------------------
// Artist Bio Writer Tests (deterministic draft generation)
// ---------------------------------------------------------------------------

describe('buildArtistBioDraft', () => {
  const baseInput: ArtistBioWriterInput = {
    artistName: 'Luna Waves',
    existingBio: 'Ambient electronic producer from Portland.',
    genres: ['ambient', 'electronic'],
    spotifyFollowers: 12500,
    spotifyPopularity: 45,
    spotifyUrl: 'https://open.spotify.com/artist/abc',
    appleMusicUrl: 'https://music.apple.com/artist/def',
    profileViews: 3200,
    releaseCount: 5,
    notableReleases: ['Tidal Drift', 'Neon Reef'],
  };

  it('generates a non-empty draft', () => {
    const result = buildArtistBioDraft(baseInput);
    expect(result.draft.length).toBeGreaterThan(0);
  });

  it('includes artist name in draft', () => {
    const result = buildArtistBioDraft(baseInput);
    expect(result.draft).toContain('Luna Waves');
  });

  it('includes genre information', () => {
    const result = buildArtistBioDraft(baseInput);
    expect(result.draft).toContain('ambient');
    expect(result.draft).toContain('electronic');
  });

  it('includes notable releases in draft', () => {
    const result = buildArtistBioDraft(baseInput);
    expect(result.draft).toContain('Tidal Drift');
    expect(result.draft).toContain('Neon Reef');
  });

  it('includes follower count in facts', () => {
    const result = buildArtistBioDraft(baseInput);
    expect(result.facts).toEqual(
      expect.arrayContaining([expect.stringContaining('12,500')])
    );
  });

  it('returns voice directives', () => {
    const result = buildArtistBioDraft(baseInput);
    expect(result.voiceDirectives.length).toBeGreaterThan(0);
    expect(result.voiceDirectives).toEqual(
      expect.arrayContaining([expect.stringContaining('third person')])
    );
  });

  describe('market signal tiers', () => {
    it('uses high-tier language for 100k+ followers', () => {
      const result = buildArtistBioDraft({
        ...baseInput,
        spotifyFollowers: 150000,
      });
      expect(result.draft).toContain('global scale');
    });

    it('uses mid-tier language for 10k-100k followers', () => {
      const result = buildArtistBioDraft({
        ...baseInput,
        spotifyFollowers: 25000,
      });
      expect(result.draft).toContain('beyond discovery');
    });

    it('uses growth language for small follower count', () => {
      const result = buildArtistBioDraft({
        ...baseInput,
        spotifyFollowers: 500,
      });
      expect(result.draft).toContain('building audience traction');
    });

    it('uses generic growth language when followers is null', () => {
      const result = buildArtistBioDraft({
        ...baseInput,
        spotifyFollowers: null,
      });
      expect(result.draft).toContain('focused growth chapter');
    });
  });

  describe('catalog signal', () => {
    it('handles zero releases', () => {
      const result = buildArtistBioDraft({
        ...baseInput,
        releaseCount: 0,
        notableReleases: [],
      });
      expect(result.draft).toContain('early stage');
    });

    it('handles releases with no notable titles', () => {
      const result = buildArtistBioDraft({
        ...baseInput,
        releaseCount: 3,
        notableReleases: [],
      });
      expect(result.draft).toContain('3 releases');
    });

    it('handles single notable release', () => {
      const result = buildArtistBioDraft({
        ...baseInput,
        notableReleases: ['Solo Track'],
      });
      expect(result.draft).toContain('Solo Track');
    });
  });

  describe('edge cases', () => {
    it('handles null existing bio', () => {
      const result = buildArtistBioDraft({
        ...baseInput,
        existingBio: null,
      });
      expect(result.draft).not.toContain('positioning emphasizes');
    });

    it('handles empty genres array', () => {
      const result = buildArtistBioDraft({
        ...baseInput,
        genres: [],
      });
      expect(result.draft).toContain('contemporary pop discipline');
    });

    it('truncates long existing bio in draft', () => {
      const longBio = 'x'.repeat(200);
      const result = buildArtistBioDraft({
        ...baseInput,
        existingBio: longBio,
      });
      // Bio excerpt should be capped at 180 chars
      const bioMatch = result.draft.match(/positioning emphasizes: "(.+?)"/);
      if (bioMatch) {
        // 180 chars + ellipsis
        expect(bioMatch[1].length).toBeLessThanOrEqual(181);
      }
    });

    it('includes profile view signal when views > 0', () => {
      const result = buildArtistBioDraft(baseInput);
      expect(result.draft).toContain('3,200');
    });

    it('uses early phase language when views are 0', () => {
      const result = buildArtistBioDraft({
        ...baseInput,
        profileViews: 0,
      });
      expect(result.draft).toContain('early phase');
    });

    it('shows correct linked platform status in facts', () => {
      const result = buildArtistBioDraft(baseInput);
      expect(result.facts).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Spotify profile linked: yes'),
          expect.stringContaining('Apple Music profile linked: yes'),
        ])
      );
    });

    it('shows unlinked platforms when URLs are null', () => {
      const result = buildArtistBioDraft({
        ...baseInput,
        spotifyUrl: null,
        appleMusicUrl: null,
      });
      expect(result.facts).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Spotify profile linked: no'),
          expect.stringContaining('Apple Music profile linked: no'),
        ])
      );
    });
  });
});
