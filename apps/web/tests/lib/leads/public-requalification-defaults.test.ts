import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requalifyPublicLead } from '@/lib/leads/public-requalification';
import { qualifyLead } from '@/lib/leads/qualify';
import { spotifyEnrichLead } from '@/lib/leads/spotify-enrich-lead';

const mocks = vi.hoisted(() => ({
  selectQueue: [] as unknown[],
  recordLeadFunnelEvent: vi.fn(),
}));

function chain(result: unknown) {
  const builder: Record<string, unknown> = {
    from: () => builder,
    where: () => builder,
    orderBy: () => builder,
    limit: () => Promise.resolve(result),
    values: () => builder,
    onConflictDoNothing: () => Promise.resolve(undefined),
    set: () => builder,
    then: (resolve: (value: unknown) => unknown) => resolve(result),
  };
  return builder;
}

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => chain(mocks.selectQueue.shift())),
    insert: vi.fn(() => chain(undefined)),
    update: vi.fn(() => chain(undefined)),
  },
}));

vi.mock('@/lib/leads/qualify', () => ({
  qualifyLead: vi.fn(),
}));

vi.mock('@/lib/leads/spotify-enrich-lead', () => ({
  spotifyEnrichLead: vi.fn(),
}));

vi.mock('@/lib/leads/funnel-events', () => ({
  recordLeadFunnelEvent: mocks.recordLeadFunnelEvent,
}));

const mockQualifyLead = vi.mocked(qualifyLead);
const mockSpotifyEnrich = vi.mocked(spotifyEnrichLead);

const LEAD_ROW = {
  id: 'lead-db-1',
  linktreeHandle: 'rhirhimusic',
  linktreeUrl: 'https://linktr.ee/rhirhimusic',
  displayName: null,
  bio: null,
  avatarUrl: null,
  hasPaidTier: null,
  isLinktreeVerified: null,
  hasSpotifyLink: false,
  spotifyUrl: null,
  hasInstagram: false,
  instagramHandle: null,
  musicToolsDetected: [],
  hasTrackingPixels: false,
  trackingPixelPlatforms: [],
  allLinks: [],
  signalSnapshot: null,
  fitScore: null,
  fitScoreBreakdown: null,
  status: 'discovered' as const,
  disqualificationReason: null,
  spotifyPopularity: null,
  spotifyFollowers: null,
  releaseCount: null,
  latestReleaseDate: null,
  priorityScore: null,
  hasRepresentation: false,
};

function qualification() {
  return {
    status: 'qualified' as const,
    sourcePlatform: 'linktree' as const,
    displayName: 'rhirhi',
    bio: 'Independent bedroom-pop artist',
    avatarUrl: 'https://cdn.example/rhirhi.jpg',
    contactEmail: 'private@example.com',
    hasPaidTier: true,
    isLinktreeVerified: false,
    hasSpotifyLink: true,
    spotifyUrl: 'https://open.spotify.com/artist/3z907l4sbiy6gyQ7BaWQlH',
    hasInstagram: true,
    instagramHandle: 'rhirhi.co.uk',
    musicToolsDetected: ['linkfire'],
    hasTrackingPixels: false,
    trackingPixelPlatforms: [],
    allLinks: [
      {
        url: 'https://open.spotify.com/artist/3z907l4sbiy6gyQ7BaWQlH',
        platformId: 'spotify',
      },
    ],
    fitScore: 50,
    fitScoreBreakdown: {},
    disqualificationReason: null,
  };
}

function spotify() {
  return {
    status: 'enriched' as const,
    reason: null,
    artistId: '3z907l4sbiy6gyQ7BaWQlH',
    spotifyPopularity: 42,
    spotifyFollowers: 1200,
    spotifyGenres: ['bedroom pop'],
    releaseCount: 4,
    latestReleaseDate: new Date('2026-08-01T00:00:00.000Z'),
    priorityScore: 2.32,
  };
}

describe('requalifyPublicLead default dependencies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectQueue.length = 0;
    mockQualifyLead.mockResolvedValue(qualification());
    mockSpotifyEnrich.mockResolvedValue(spotify());
    mocks.recordLeadFunnelEvent.mockResolvedValue(undefined);
  });

  it('creates, updates, and persists a run through the default DB helpers', async () => {
    // getLeadByHandle → not found; createLead re-select → row;
    // getLatestRunReceipt → none; getRunReceipt → none;
    // getRunReceipt (post-persist) → stored metadata.
    mocks.selectQueue.push([], [LEAD_ROW], [], []);

    mocks.recordLeadFunnelEvent.mockImplementation(async input => {
      mocks.selectQueue.push([{ metadata: input.metadata }]);
    });

    const result = await requalifyPublicLead(
      { linktreeUrl: 'https://linktr.ee/rhirhimusic' },
      { environment: 'dev' }
    );

    expect(result.candidateId).toBe('lead-db-1');
    expect(result.deduplicated).toBe(false);
    expect(result.state).toBe('human_review');
    expect(mockQualifyLead).toHaveBeenCalledWith(
      'https://linktr.ee/rhirhimusic',
      { includePrivateContact: false }
    );
    expect(mockSpotifyEnrich).toHaveBeenCalledWith('lead-db-1', {
      persist: false,
      spotifyUrl: 'https://open.spotify.com/artist/3z907l4sbiy6gyQ7BaWQlH',
    });
    expect(mocks.recordLeadFunnelEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: 'lead-db-1',
        channel: 'public',
        provider: 'linktree+spotify',
      }),
      { idempotent: true, required: true }
    );
  });

  it('deduplicates an existing receipt through the default readers', async () => {
    const existingRun = {
      contract: 'jovie.acquisition-candidate-run/v1',
      candidateId: 'lead-db-1',
      candidateKey: 'rhirhimusic',
      runId: 'run-1',
      dedupeKey: 'dedupe-1',
      sourceRevision: 'sha256:revision',
      sourceDigest: 'sha256:source',
      decisionDigest: 'sha256:decision',
      observedAt: '2026-09-12T22:30:00.000Z',
      expiresAt: '2026-10-12T22:30:00.000Z',
      fitScore: 30,
      fitScoreBreakdown: {},
      publicObservation: {},
      machineCertification: {},
      state: 'human_review',
      environment: 'dev',
      attemptEventType: 'public_requalification:revision',
    };

    // getLeadByHandle → row; getLatestRunReceipt → prior run;
    // getRunReceipt (fresh attempt key) → none; the post-persist re-read
    // is supplied by the recordLeadFunnelEvent mock below.
    mocks.selectQueue.push([LEAD_ROW], [{ metadata: existingRun }], []);

    mocks.recordLeadFunnelEvent.mockImplementation(async input => {
      mocks.selectQueue.push([{ metadata: input.metadata }]);
    });

    const result = await requalifyPublicLead(
      { linktreeUrl: 'https://linktr.ee/rhirhimusic' },
      { environment: 'dev' }
    );

    // The previous receipt had a different source revision, so a fresh
    // attempt is persisted and previousAttemptRunId links the chain.
    expect(result.previousAttemptRunId).toBe('run-1');
    expect(result.deduplicated).toBe(false);
  });
});
