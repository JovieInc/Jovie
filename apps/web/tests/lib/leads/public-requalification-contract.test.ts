import { describe, expect, it } from 'vitest';
import {
  buildPublicRun,
  getPublicDspSignals,
  PUBLIC_REQUALIFICATION_FIT_INPUT_VERSION,
  PUBLIC_REQUALIFICATION_SCOPE,
  publicRequalificationEventType,
  runFromMetadata,
} from '@/lib/leads/public-requalification-contract';
import type { QualificationResult } from '@/lib/leads/qualify';
import type { SpotifyLeadEnrichment } from '@/lib/leads/spotify-enrich-lead';

function qualification(): QualificationResult {
  return {
    status: 'qualified',
    sourcePlatform: 'linktree',
    displayName: 'Public Artist',
    bio: 'Independent artist',
    avatarUrl: 'https://cdn.example/artist.jpg',
    contactEmail: 'private@example.com',
    hasPaidTier: true,
    isLinktreeVerified: true,
    hasSpotifyLink: true,
    spotifyUrl: 'https://open.spotify.com/artist/artist123',
    hasInstagram: true,
    instagramHandle: 'public.artist',
    musicToolsDetected: ['bandcamp'],
    hasTrackingPixels: false,
    trackingPixelPlatforms: [],
    allLinks: [
      {
        url: 'https://instagram.com/public.artist',
        platformId: 'instagram',
      },
      {
        url: 'https://open.spotify.com/artist/artist123',
        platformId: 'spotify',
      },
    ],
    fitScore: 0,
    fitScoreBreakdown: {},
    disqualificationReason: null,
  };
}

function spotify(): SpotifyLeadEnrichment {
  return {
    status: 'enriched',
    reason: null,
    artistId: 'artist123',
    spotifyPopularity: 30,
    spotifyFollowers: 900,
    spotifyGenres: ['indie pop'],
    releaseCount: 3,
    latestReleaseDate: new Date('2026-08-01T00:00:00.000Z'),
    priorityScore: 1.8,
  };
}

describe('public requalification contract', () => {
  it('uses the source revision as an immutable attempt identity', () => {
    expect(publicRequalificationEventType('sha256:abc')).toBe(
      'public_requalification:abc'
    );
    expect(publicRequalificationEventType('abc')).toBe(
      'public_requalification:abc'
    );
  });

  it('counts distinct supported public DSP links and ignores unsupported links', () => {
    expect(
      getPublicDspSignals([
        { platformId: 'spotify', url: 'https://open.spotify.com/artist/1' },
        { platformId: 'spotify', url: 'https://open.spotify.com/album/2' },
        { platformId: 'apple_music', url: 'https://music.apple.com/artist/1' },
        { platformId: 'apple_music', url: 'https://music.apple.com/album/2' },
        { platformId: 'soundcloud', url: 'https://soundcloud.com/artist' },
        { platformId: 'bandcamp', url: 'https://artist.bandcamp.com' },
        { platformId: 'instagram', url: 'https://instagram.com/artist' },
        { platformId: 'unsupported', url: 'https://example.com/other' },
        { url: 'https://example.com/missing-platform' },
      ])
    ).toEqual({
      dspPlatformCount: 3,
      hasAppleMusicId: true,
      hasSoundCloudId: true,
    });
  });

  it('builds a public run without serializing private contact data', () => {
    const run = buildPublicRun({
      candidateId: 'lead-public-artist',
      candidateKey: 'publicartist',
      profileUrl: 'https://linktr.ee/publicartist',
      qualification: qualification(),
      spotify: spotify(),
      existingRepresentation: false,
      observedAt: new Date('2026-09-12T22:30:00.000Z'),
      previousAttemptRunId: null,
    });

    expect(run.contract).toBe('jovie.acquisition-candidate-run/v1');
    expect(run.requestedScope).toBe(PUBLIC_REQUALIFICATION_SCOPE);
    expect(run.fitInputVersion).toBe(PUBLIC_REQUALIFICATION_FIT_INPUT_VERSION);
    expect(run.runId).toMatch(
      /^premade-profile-certification-v1:lead-public-artist:[0-9a-f]{64}$/
    );
    expect(run.dedupeKey).toContain('publicartist:sha256:');
    expect(run.expiresAt).toBe('2026-10-12T22:30:00.000Z');
    expect(run.publicObservation.qualification).not.toHaveProperty(
      'contactEmail'
    );
    expect(JSON.stringify(run)).not.toContain('private@example.com');
    expect(run.sourceUrls).toEqual([
      'https://instagram.com/public.artist',
      'https://linktr.ee/publicartist',
      'https://open.spotify.com/artist/artist123',
    ]);
  });

  it('maps public DSP presence into fit inputs and preserves it in the digest', () => {
    const base = buildPublicRun({
      candidateId: 'lead-public-artist',
      candidateKey: 'publicartist',
      profileUrl: 'https://linktr.ee/publicartist',
      qualification: qualification(),
      spotify: spotify(),
      existingRepresentation: false,
      observedAt: new Date('2026-09-12T22:30:00.000Z'),
      previousAttemptRunId: null,
    });
    const publicLinks = [
      ...qualification().allLinks,
      {
        url: 'https://music.apple.com/artist/artist123',
        platformId: 'apple_music',
      },
      {
        url: 'https://music.apple.com/artist/artist123?duplicate=1',
        platformId: 'apple_music',
      },
      { url: 'https://soundcloud.com/publicartist', platformId: 'soundcloud' },
      { url: 'https://publicartist.bandcamp.com', platformId: 'bandcamp' },
    ];
    const withDspLinks = buildPublicRun({
      candidateId: 'lead-public-artist',
      candidateKey: 'publicartist',
      profileUrl: 'https://linktr.ee/publicartist',
      qualification: { ...qualification(), allLinks: publicLinks },
      spotify: spotify(),
      existingRepresentation: false,
      observedAt: new Date('2026-09-12T22:30:00.000Z'),
      previousAttemptRunId: null,
    });

    expect(withDspLinks.fitScoreBreakdown.multiDspPresence).toBe(5);
    expect(withDspLinks.fitScoreBreakdown.meta?.dspPlatformCount).toBe(3);
    expect(withDspLinks.fitScoreBreakdown.hasContactEmail).toBe(0);
    expect(withDspLinks.sourceRevision).not.toBe(base.sourceRevision);
    expect(withDspLinks.publicObservation.qualification.allLinks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ platformId: 'apple_music' }),
        expect.objectContaining({ platformId: 'soundcloud' }),
      ])
    );
  });

  it('backfills the current attempt key when reading legacy metadata', () => {
    const run = runFromMetadata({
      contract: 'jovie.acquisition-candidate-run/v1',
      candidateId: 'lead-public-artist',
      candidateKey: 'publicartist',
      runId: 'run-1',
      dedupeKey: 'dedupe-1',
      sourceRevision: 'sha256:revision',
      sourceDigest: 'sha256:source',
      decisionDigest: 'sha256:decision',
      observedAt: '2026-09-12T22:30:00.000Z',
      expiresAt: '2026-10-12T22:30:00.000Z',
      fitScore: 30,
      publicObservation: {},
      machineCertification: {},
    });

    expect(run?.attemptEventType).toBe('public_requalification:revision');
    expect(run?.previousAttemptRunId).toBeNull();
  });

  it('rejects metadata without the public contract identity', () => {
    expect(runFromMetadata({ candidateId: 'lead-public-artist' })).toBeNull();
  });
});
