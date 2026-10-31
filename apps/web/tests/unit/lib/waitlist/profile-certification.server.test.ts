import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const store = new Map<string, string>();
  const queue: unknown[][] = [];
  return {
    store,
    queue,
    backend: {
      get: async (key: string) => store.get(key) ?? null,
      setIfAbsent: async (key: string, value: unknown) =>
        store.has(key) ? false : (store.set(key, String(value)), true),
      compareAndSet: async (key: string, expected: string, next: string) =>
        store.get(key) === expected ? (store.set(key, next), true) : false,
    },
    fetch: vi.fn(),
    importCatalog: vi.fn(),
    submitCard: vi.fn(),
    capture: vi.fn(),
    scheduleAfter: vi.fn((task: () => unknown) => {
      void task();
      return true;
    }),
  };
});

/** Every select resolves to the next queued row set, in call order. */
function builder() {
  const chain: Record<string, unknown> = {};
  for (const method of ['from', 'where', 'limit', 'groupBy']) {
    chain[method] = () => chain;
  }
  chain.then = (resolve: (rows: unknown[]) => unknown) =>
    resolve(mocks.queue.shift() ?? []);
  return chain;
}

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: { select: () => builder() } }));
vi.mock('@/lib/ovie/mcp/postgres-backend', () => ({
  postgresRecordBackend: () => mocks.backend,
}));
vi.mock('@/lib/observability/build-info', () => ({
  getDeployedBuildInfo: async () => ({ commitSha: 'a'.repeat(40) }),
}));
vi.mock('@/lib/http/bounded-fetch', () => ({ boundedFetch: mocks.fetch }));
vi.mock('@/lib/next/schedule-after', () => ({
  scheduleAfter: mocks.scheduleAfter,
}));
vi.mock('@/lib/ovie/summer-cards.server', () => ({
  submitSummerCard: mocks.submitCard,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.capture }));
vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}));

import {
  certifyProfile,
  certifyWaitlistEntry,
  readProfileCertRecord,
  scheduleProfileCertification,
} from '@/lib/waitlist/profile-certification.server';

const PROFILE = {
  id: 'profile-1',
  userId: 'user-1',
  waitlistEntryId: 'entry-1',
  displayName: 'Ana Lund',
  username: 'analund',
  avatarUrl: 'https://i.scdn.co/image/abc',
  spotifyId: 'sp1',
  isPublic: false,
  settings: { onboarding: { selectedSpotifyArtistId: 'sp1' } },
};
const certifiedIdentity = async () =>
  ({ decision: 'certified', score: 0.95, threshold: 0.85 }) as const;

const OWNER = {
  name: 'Ana Lund',
  plan: 'free',
  isPro: false,
  stripeSubscriptionId: null,
  trialEndsAt: null,
};

/** Queue the reads certifyProfile performs for one profile. */
function queueProfile(
  profile: typeof PROFILE,
  releases: { id: string; title: string; slug: string }[]
) {
  mocks.queue.push(
    [profile],
    [OWNER],
    [{ fullName: 'Ana Lund' }],
    releases.map(r => ({ ...r, artworkUrl: 'https://x/a.jpg' }))
  );
  if (releases.length > 0) {
    mocks.queue.push(releases.map(r => ({ releaseId: r.id, n: 2 })));
  }
}

describe('certifyProfile', () => {
  beforeEach(() => {
    mocks.store.clear();
    mocks.queue.length = 0;
    vi.clearAllMocks();
  });

  it('passes a complete profile and persists a SHA-bound receipt', async () => {
    queueProfile(PROFILE, [{ id: 'r1', title: 'Spring', slug: 'spring' }]);
    mocks.queue.push([{ userId: 'user-1' }]);

    const receipt = await certifyProfile({
      profileId: 'profile-1',
      trigger: 'waitlist_approval',
      readIdentity: certifiedIdentity,
    });

    expect(receipt?.status).toBe('passed');
    expect(receipt?.sha).toBe('a'.repeat(40));
    const record = await readProfileCertRecord('profile-1');
    expect(record?.lastPassedSha).toBe('a'.repeat(40));
    expect(mocks.importCatalog).not.toHaveBeenCalled();
    expect(mocks.submitCard).not.toHaveBeenCalled();
  });

  it('imports the catalog when an artist-confirmed profile has no releases', async () => {
    queueProfile(PROFILE, []);
    mocks.queue.push([{ userId: 'user-1' }]);

    const receipt = await certifyProfile({
      profileId: 'profile-1',
      trigger: 'waitlist_approval',
      importCatalog: mocks.importCatalog,
      readIdentity: certifiedIdentity,
    });

    expect(receipt?.status).toBe('failed');
    expect(mocks.importCatalog).toHaveBeenCalledWith({
      profileId: 'profile-1',
      spotifyArtistId: 'sp1',
      spotifyArtistUrl: 'https://open.spotify.com/artist/sp1',
      userId: 'user-1',
    });
  });

  it('sends a still-empty profile after an import to an operator, not back to the import', async () => {
    queueProfile(PROFILE, []);
    mocks.queue.push([{ userId: 'user-1' }]);

    await certifyProfile({
      profileId: 'profile-1',
      trigger: 'catalog_import',
      importCatalog: mocks.importCatalog,
      readIdentity: certifiedIdentity,
    });

    expect(mocks.importCatalog).not.toHaveBeenCalled();
    expect(mocks.submitCard).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'decision',
        evidence: ['profile-cert:profile-1'],
      })
    );
  });

  it('probes a public page and its smart links', async () => {
    queueProfile({ ...PROFILE, isPublic: true }, [
      { id: 'r1', title: 'Spring', slug: 'spring' },
    ]);
    mocks.queue.push([{ userId: 'user-1' }]);
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '<html>ok</html>',
    });

    const receipt = await certifyProfile({
      profileId: 'profile-1',
      trigger: 'manual',
      readIdentity: certifiedIdentity,
    });

    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(receipt?.checks.find(c => c.id === 'public_page')?.status).toBe(
      'passed'
    );
  });

  it('fails the artist check closed when no identity reader is wired', async () => {
    queueProfile(PROFILE, [{ id: 'r1', title: 'Spring', slug: 'spring' }]);
    mocks.queue.push([{ userId: 'user-1' }]);
    const receipt = await certifyProfile({
      profileId: 'profile-1',
      trigger: 'manual',
    });
    expect(receipt?.status).toBe('needs_artist_confirmation');
  });

  it('returns null for an unknown profile', async () => {
    mocks.queue.push([]);
    await expect(
      certifyProfile({ profileId: 'missing', trigger: 'manual' })
    ).resolves.toBeNull();
  });

  it('reports no_profile for an entry without a profile', async () => {
    mocks.queue.push([]);
    await expect(
      certifyWaitlistEntry({ entryId: 'entry-x', trigger: 'manual' })
    ).resolves.toEqual({ outcome: 'no_profile' });
  });

  it('schedules certification after the response and never throws', async () => {
    mocks.queue.push([]);
    scheduleProfileCertification({ profileId: 'missing', trigger: 'claim' });
    await vi.waitFor(() => expect(mocks.scheduleAfter).toHaveBeenCalled());
    expect(mocks.capture).not.toHaveBeenCalled();
  });
});
