import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PUBLIC_REQUALIFICATION_FIT_INPUT_VERSION,
  type PublicCandidateRun,
  type PublicLeadRecord,
  PublicRequalificationConflictError,
  type PublicRequalificationDependencies,
  publicRequalificationEventType,
  requalifyPublicLead,
} from '@/lib/leads/public-requalification';
import { qualifyLead } from '@/lib/leads/qualify';
import { spotifyEnrichLead } from '@/lib/leads/spotify-enrich-lead';

vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/leads/qualify', () => ({
  qualifyLead: vi.fn(),
}));
vi.mock('@/lib/leads/spotify-enrich-lead', () => ({
  spotifyEnrichLead: vi.fn(),
}));
const mockQualifyLead = vi.mocked(qualifyLead);
const mockSpotifyEnrichLead = vi.mocked(spotifyEnrichLead);
const FIXED_NOW = new Date('2026-09-12T22:30:00.000Z');
function lead(): PublicLeadRecord {
  return {
    id: 'lead-rhirhi',
    linktreeHandle: 'rhirhimusic',
    linktreeUrl: 'https://linktr.ee/rhirhimusic',
    status: 'discovered',
    hasRepresentation: false,
  } as PublicLeadRecord;
}
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
      {
        url: 'https://instagram.com/rhirhi.co.uk',
        platformId: 'instagram',
      },
      { url: 'https://lnk.to/rhirhi', platformId: 'linkfire' },
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

function dependencies(
  overrides: Partial<PublicRequalificationDependencies> = {}
) {
  const receipts = new Map<string, Record<string, unknown>>();
  const updateLead = vi.fn(
    async (_leadId: string, _update: unknown) => undefined
  );
  const persistRunReceipt = vi.fn(
    async ({
      run,
      eventType,
    }: {
      run: PublicCandidateRun;
      eventType: string;
    }) => {
      if (receipts.has(eventType)) return false;
      receipts.set(eventType, run as unknown as Record<string, unknown>);
      return true;
    }
  );
  const getRunReceipt = vi.fn(
    async (_leadId: string, eventType: string) =>
      receipts.get(eventType) ?? null
  );
  const getLatestRunReceipt = vi.fn(async () => {
    const latest = [...receipts.values()].at(-1);
    return latest ?? null;
  });
  const deps: PublicRequalificationDependencies = {
    environment: 'dev',
    now: () => FIXED_NOW,
    getLeadByHandle: vi.fn(async () => lead()),
    updateLead,
    getRunReceipt,
    getLatestRunReceipt,
    persistRunReceipt,
    qualify: mockQualifyLead,
    spotifyEnrich: mockSpotifyEnrichLead,
    ...overrides,
  };
  return {
    deps,
    updateLead,
    persistRunReceipt,
    receipts,
    getReceipt: (eventType: string) => receipts.get(eventType) ?? null,
  };
}

describe('requalifyPublicLead', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQualifyLead.mockResolvedValue(qualification());
    mockSpotifyEnrichLead.mockResolvedValue(spotify());
  });

  it('persists an immutable public run without private contact data', async () => {
    const { deps, updateLead, persistRunReceipt } = dependencies();

    const result = await requalifyPublicLead(
      { linktreeUrl: 'https://linktr.ee/RHIRHIMUSIC' },
      deps
    );

    expect(result.environment).toBe('dev');
    expect(result.fitInputVersion).toBe(
      PUBLIC_REQUALIFICATION_FIT_INPUT_VERSION
    );
    expect(result.candidateId).toBe('lead-rhirhi');
    expect(result.state).toBe('human_review');
    expect(
      result.machineCertification.criteria.find(item => item.id === 'contact')
        ?.passed
    ).toBe(true);
    expect(result.sourceRevision).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(result.sourceDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(result.decisionDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(result.expiresAt).toBe('2026-10-12T22:30:00.000Z');
    expect(
      result.machineCertification.receipts.every(
        receipt =>
          receipt.sourceSha?.startsWith('sha256:') &&
          receipt.digest?.startsWith('sha256:') &&
          receipt.ref === 'https://linktr.ee/rhirhimusic'
      )
    ).toBe(true);
    expect(result.fitScoreBreakdown.hasContactEmail).toBe(0);
    expect(mockQualifyLead).toHaveBeenCalledWith(
      'https://linktr.ee/rhirhimusic',
      { includePrivateContact: false }
    );
    expect(mockSpotifyEnrichLead).toHaveBeenCalledWith('lead-rhirhi', {
      persist: false,
      spotifyUrl: qualification().spotifyUrl,
    });
    expect(updateLead).toHaveBeenCalledTimes(1);
    expect(updateLead.mock.calls[0]?.[1]).not.toHaveProperty('contactEmail');
    expect(persistRunReceipt).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(persistRunReceipt.mock.calls[0]?.[0])).not.toContain(
      'private@example.com'
    );
  });

  it('keeps an incomplete public observation machine-failed', async () => {
    const failedQualification = {
      ...qualification(),
      displayName: null,
      avatarUrl: null,
      hasSpotifyLink: false,
      spotifyUrl: null,
      hasInstagram: false,
      instagramHandle: null,
      allLinks: [],
    };
    const skippedSpotify = {
      status: 'skipped' as const,
      reason: 'no_spotify_url',
      artistId: null,
      spotifyPopularity: null,
      spotifyFollowers: null,
      spotifyGenres: [],
      releaseCount: null,
      latestReleaseDate: null,
      priorityScore: null,
    };
    const { deps } = dependencies({
      qualify: vi.fn(async () => failedQualification),
      spotifyEnrich: vi.fn(async () => skippedSpotify),
    });

    const result = await requalifyPublicLead(
      { linktreeUrl: 'https://linktr.ee/rhirhimusic' },
      deps
    );

    expect(result.state).toBe('machine_failed');
    expect(result.machineCertification.failures.map(item => item.id)).toEqual(
      expect.arrayContaining([
        'identity',
        'spotify',
        'avatar',
        'contact',
        'fit',
      ])
    );
  });

  it('deduplicates an identical source revision without updating the lead', async () => {
    const first = dependencies();
    const initial = await requalifyPublicLead(
      { linktreeUrl: 'https://linktr.ee/rhirhimusic' },
      first.deps
    );
    const result = await requalifyPublicLead(
      { linktreeUrl: 'https://linktr.ee/rhirhimusic' },
      first.deps
    );

    expect(initial.deduplicated).toBe(false);
    expect(result.deduplicated).toBe(true);
    expect(result.sourceRevision).toBe(initial.sourceRevision);
    expect(first.updateLead).toHaveBeenCalledTimes(1);
    expect(first.persistRunReceipt).toHaveBeenCalledTimes(1);
  });

  it('rejects a conflicting payload for the same immutable attempt key', async () => {
    const first = dependencies();
    const initial = await requalifyPublicLead(
      { linktreeUrl: 'https://linktr.ee/rhirhimusic' },
      first.deps
    );
    const receipt = first.getReceipt(initial.attemptEventType);
    const tampered = {
      ...receipt,
      sourceDigest: 'sha256:tampered',
    };
    const { deps, updateLead } = dependencies({
      getRunReceipt: vi.fn(async (_leadId: string, eventType: string) =>
        eventType === initial.attemptEventType ? tampered : null
      ),
      getLatestRunReceipt: vi.fn(async () => tampered),
    });

    await expect(
      requalifyPublicLead(
        { linktreeUrl: 'https://linktr.ee/rhirhimusic' },
        deps
      )
    ).rejects.toBeInstanceOf(PublicRequalificationConflictError);
    expect(updateLead).not.toHaveBeenCalled();
  });

  it('appends a new attempt for a genuinely new public observation', async () => {
    const first = dependencies();
    const initial = await requalifyPublicLead(
      { linktreeUrl: 'https://linktr.ee/rhirhimusic' },
      first.deps
    );
    const changedQualification = {
      ...qualification(),
      displayName: 'rhirhi live',
    };
    const secondQualification = vi.fn(async () => changedQualification);
    const second = dependencies({
      qualify: secondQualification,
      getLatestRunReceipt: vi.fn(async () =>
        first.getReceipt(initial.attemptEventType)
      ),
    });

    const result = await requalifyPublicLead(
      { linktreeUrl: 'https://linktr.ee/rhirhimusic' },
      second.deps
    );

    expect(result.deduplicated).toBe(false);
    expect(result.sourceRevision).not.toBe(initial.sourceRevision);
    expect(result.attemptEventType).toBe(
      publicRequalificationEventType(result.sourceRevision)
    );
    expect(result.previousAttemptRunId).toBe(initial.runId);
    expect(second.receipts.has(result.attemptEventType)).toBe(true);
    expect(first.getReceipt(initial.attemptEventType)).toMatchObject({
      runId: initial.runId,
      sourceRevision: initial.sourceRevision,
    });
  });

  it('records partial Spotify evidence without inventing release metrics', async () => {
    const partial = {
      ...spotify(),
      status: 'partial' as const,
      reason: 'albums_unavailable',
      releaseCount: null,
      latestReleaseDate: null,
      priorityScore: null,
    };
    const { deps, updateLead } = dependencies({
      spotifyEnrich: vi.fn(async () => partial),
    });

    const result = await requalifyPublicLead(
      { linktreeUrl: 'https://linktr.ee/rhirhimusic' },
      deps
    );

    expect(result.publicObservation.spotify).toMatchObject({
      status: 'partial',
      reason: 'albums_unavailable',
      releaseCount: null,
      latestReleaseDate: null,
      priorityScore: null,
    });
    expect(updateLead.mock.calls[0]?.[1]).toMatchObject({
      releaseCount: null,
      latestReleaseDate: null,
      priorityScore: null,
    });
  });

  it('deduplicates concurrent refreshes for the same source revision', async () => {
    const shared = dependencies();
    let preflightReads = 0;
    let releaseGate!: () => void;
    const gate = new Promise<void>(resolve => {
      releaseGate = resolve;
    });
    shared.deps.getRunReceipt = vi.fn(
      async (_leadId: string, eventType: string) => {
        preflightReads += 1;
        if (preflightReads <= 2) {
          if (preflightReads === 2) releaseGate();
          await gate;
          return null;
        }
        return shared.receipts.get(eventType) ?? null;
      }
    );
    const [left, right] = await Promise.all([
      requalifyPublicLead(
        { linktreeUrl: 'https://linktr.ee/rhirhimusic' },
        shared.deps
      ),
      requalifyPublicLead(
        { linktreeUrl: 'https://linktr.ee/rhirhimusic' },
        shared.deps
      ),
    ]);

    expect([left.deduplicated, right.deduplicated].sort()).toEqual([
      false,
      true,
    ]);
    expect(shared.persistRunReceipt).toHaveBeenCalledTimes(2);
    expect(shared.receipts.size).toBe(1);
    expect(left.runId).toBe(right.runId);
  });

  it('refuses preview and production execution', async () => {
    const { deps } = dependencies({ environment: 'preview' });

    await expect(
      requalifyPublicLead(
        { linktreeUrl: 'https://linktr.ee/rhirhimusic' },
        deps
      )
    ).rejects.toThrow('dev-only');
  });
});
