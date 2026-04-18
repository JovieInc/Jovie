/**
 * Lead Qualification Tests
 *
 * Tests for the qualifyLead function which fetches Linktree data,
 * extracts signals, and determines qualification status.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { qualifyLead } from '@/lib/leads/qualify';

vi.mock('@/lib/ingestion/strategies/linktree', () => ({
  fetchLinktreeDocument: vi.fn(),
  extractLinktree: vi.fn(),
  detectLinktreePaidTier: vi.fn(),
  extractLinktreeHandle: vi.fn(),
  isLinktreeUrl: vi.fn(),
}));

vi.mock('@/lib/ingestion/strategies/linktree/paid-tier', () => ({
  detectLinktreeVerification: vi.fn(),
}));

vi.mock('@/lib/ingestion/strategies/base', () => ({
  extractScriptJson: vi.fn(),
}));

vi.mock('@/lib/fit-scoring/calculator', () => ({
  calculateFitScore: vi.fn().mockReturnValue({ score: 50, breakdown: {} }),
  MUSIC_TOOL_PLATFORMS: new Set([
    'linkfire',
    'toneden',
    'featurefm',
    'laylo',
    'distrokid',
    'songwhip',
    'odesli',
  ]),
}));

import { calculateFitScore } from '@/lib/fit-scoring/calculator';
import { extractScriptJson } from '@/lib/ingestion/strategies/base';
import {
  detectLinktreePaidTier,
  extractLinktree,
  fetchLinktreeDocument,
} from '@/lib/ingestion/strategies/linktree';
import { detectLinktreeVerification } from '@/lib/ingestion/strategies/linktree/paid-tier';

const mockFetchLinktreeDocument = vi.mocked(fetchLinktreeDocument);
const mockExtractLinktree = vi.mocked(extractLinktree);
const mockDetectLinktreePaidTier = vi.mocked(detectLinktreePaidTier);
const mockExtractScriptJson = vi.mocked(extractScriptJson);
const mockDetectLinktreeVerification = vi.mocked(detectLinktreeVerification);
const mockCalculateFitScore = vi.mocked(calculateFitScore);

function setupDefaultMocks(
  overrides: {
    links?: Array<{ url: string; platformId: string }>;
    displayName?: string;
    bio?: string;
    avatarUrl?: string;
    contactEmail?: string | null;
    hasPaidTier?: boolean;
    isVerified?: boolean;
  } = {}
) {
  const {
    links = [
      { url: 'https://open.spotify.com/artist/123', platformId: 'spotify' },
      { url: 'https://instagram.com/testartist', platformId: 'instagram' },
    ],
    displayName = 'Test Artist',
    bio = 'Making beats',
    avatarUrl = 'https://example.com/avatar.jpg',
    contactEmail = 'test@example.com',
    hasPaidTier = false,
    isVerified = false,
  } = overrides;

  mockFetchLinktreeDocument.mockResolvedValue('<html>mock</html>');
  mockExtractLinktree.mockReturnValue({
    displayName,
    bio,
    avatarUrl,
    contactEmail,
    links,
  } as ReturnType<typeof extractLinktree>);
  mockDetectLinktreePaidTier.mockReturnValue(hasPaidTier);
  mockExtractScriptJson.mockReturnValue(null);
  mockDetectLinktreeVerification.mockReturnValue(isVerified);
  mockCalculateFitScore.mockReturnValue({
    score: 50,
    breakdown: {},
  } as ReturnType<typeof calculateFitScore>);
}

describe('qualifyLead', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should qualify verified Linktree with Spotify link', async () => {
    setupDefaultMocks({ isVerified: true });

    const result = await qualifyLead('https://linktr.ee/testartist');

    expect(result.status).toBe('qualified');
    expect(result.hasSpotifyLink).toBe(true);
    expect(result.isLinktreeVerified).toBe(true);
    expect(result.disqualificationReason).toBeNull();
  });

  it('should qualify paid tier with Spotify link', async () => {
    setupDefaultMocks({ hasPaidTier: true });

    const result = await qualifyLead('https://linktr.ee/testartist');

    expect(result.status).toBe('qualified');
    expect(result.hasSpotifyLink).toBe(true);
    expect(result.hasPaidTier).toBe(true);
    expect(result.disqualificationReason).toBeNull();
  });

  it('should qualify free tier with Spotify and music tool (linkfire)', async () => {
    setupDefaultMocks({
      links: [
        { url: 'https://open.spotify.com/artist/123', platformId: 'spotify' },
        { url: 'https://instagram.com/testartist', platformId: 'instagram' },
        { url: 'https://lnk.to/something', platformId: 'linkfire' },
      ],
    });

    const result = await qualifyLead('https://linktr.ee/testartist');

    expect(result.status).toBe('qualified');
    expect(result.hasSpotifyLink).toBe(true);
    expect(result.musicToolsDetected).toContain('linkfire');
    expect(result.disqualificationReason).toBeNull();
  });

  it('should disqualify when no Spotify link is present', async () => {
    setupDefaultMocks({
      links: [
        { url: 'https://instagram.com/testartist', platformId: 'instagram' },
        { url: 'https://twitter.com/testartist', platformId: 'twitter' },
      ],
    });

    const result = await qualifyLead('https://linktr.ee/testartist');

    expect(result.status).toBe('disqualified');
    expect(result.hasSpotifyLink).toBe(false);
    expect(result.disqualificationReason).toBe('no_spotify');
  });

  it('should disqualify free tier with Spotify but no music tools', async () => {
    setupDefaultMocks({
      links: [
        { url: 'https://open.spotify.com/artist/123', platformId: 'spotify' },
        { url: 'https://instagram.com/testartist', platformId: 'instagram' },
      ],
    });

    const result = await qualifyLead('https://linktr.ee/testartist');

    expect(result.status).toBe('disqualified');
    expect(result.hasSpotifyLink).toBe(true);
    expect(result.hasPaidTier).toBe(false);
    expect(result.isLinktreeVerified).toBe(false);
    expect(result.musicToolsDetected).toHaveLength(0);
    expect(result.disqualificationReason).toBe('free_tier_no_music_tool');
  });

  it('should extract display name, bio, avatar, and contact email correctly', async () => {
    setupDefaultMocks({
      displayName: 'DJ Awesome',
      bio: 'Electronic music producer',
      avatarUrl: 'https://example.com/dj-awesome.jpg',
      contactEmail: 'dj@awesome.com',
      isVerified: true,
    });

    const result = await qualifyLead('https://linktr.ee/djawesome');

    expect(result.displayName).toBe('DJ Awesome');
    expect(result.bio).toBe('Electronic music producer');
    expect(result.avatarUrl).toBe('https://example.com/dj-awesome.jpg');
    expect(result.contactEmail).toBe('dj@awesome.com');
  });

  it('should detect Instagram handle from URL', async () => {
    setupDefaultMocks({ isVerified: true });

    const result = await qualifyLead('https://linktr.ee/testartist');

    expect(result.hasInstagram).toBe(true);
    expect(result.instagramHandle).toBe('testartist');
  });

  it('should return Spotify URL when present', async () => {
    setupDefaultMocks({ isVerified: true });

    const result = await qualifyLead('https://linktr.ee/testartist');

    expect(result.spotifyUrl).toBe('https://open.spotify.com/artist/123');
  });

  it('should return fit score from calculator', async () => {
    setupDefaultMocks({ isVerified: true });
    mockCalculateFitScore.mockReturnValue({
      score: 75,
      breakdown: { usesLinkInBio: 15 },
    } as ReturnType<typeof calculateFitScore>);

    const result = await qualifyLead('https://linktr.ee/testartist');

    expect(result.fitScore).toBe(75);
    expect(result.fitScoreBreakdown).toEqual({ usesLinkInBio: 15 });
  });

  it('should return all extracted links', async () => {
    const links = [
      { url: 'https://open.spotify.com/artist/123', platformId: 'spotify' },
      { url: 'https://instagram.com/testartist', platformId: 'instagram' },
      { url: 'https://twitter.com/testartist', platformId: 'twitter' },
    ];
    setupDefaultMocks({ links, isVerified: true });

    const result = await qualifyLead('https://linktr.ee/testartist');

    expect(result.allLinks).toHaveLength(3);
  });

  it('should handle null contact email', async () => {
    setupDefaultMocks({ contactEmail: null, isVerified: true });

    const result = await qualifyLead('https://linktr.ee/testartist');

    expect(result.contactEmail).toBeNull();
  });
});
