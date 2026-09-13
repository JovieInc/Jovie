import { describe, expect, it } from 'vitest';
import {
  buildPublicRun,
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
