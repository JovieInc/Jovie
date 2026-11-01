import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    env: {} as Record<string, string | undefined>,
    store,
    selectResults: [] as unknown[][],
    upsertRelease: vi.fn(),
    upsertProviderLink: vi.fn(),
    captureError: vi.fn(),
    redis: {
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      set: vi.fn(async (key: string, value: string) => {
        store.set(key, value);
        return 'OK';
      }),
    },
  };
});
function chain(result: unknown[]) {
  const c: Record<string, unknown> = {};
  for (const m of ['from', 'leftJoin', 'where', 'orderBy', 'limit']) {
    c[m] = () => c;
  }
  c.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return c;
}
vi.mock('server-only', () => ({}));
vi.mock('@/lib/env-server', () => ({ env: h.env }));
vi.mock('@/lib/redis', () => ({ getRedis: () => h.redis }));
vi.mock('@/lib/error-tracking', () => ({ captureError: h.captureError }));
vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/discography/queries', () => ({
  upsertRelease: h.upsertRelease,
  upsertProviderLink: h.upsertProviderLink,
}));
vi.mock('@/lib/db', () => ({
  db: { select: () => chain(h.selectResults.shift() ?? []) },
}));
const { runReleaseEmailCanary, getReleaseEmailCanaryStatus } = await import(
  './release-email.server'
);
const {
  RELEASE_EMAIL_CANARY_PENDING_REDIS_KEY,
  RELEASE_EMAIL_CANARY_REDIS_KEY,
} = await import('./release-email');
const PROFILE_ID = '0de33b39-ebcf-42ef-bcdd-c22bd8577368';
const INBOX = 'release-canary+synthetic-release-email@inbound.jov.ie';
const ARTIST = 'release-canary+synthetic-release-artist@inbound.jov.ie';
const NOW = new Date('2026-10-29T18:00:00.000Z');
const CREATED = new Date('2026-10-29T17:00:00.000Z');
const PREV_RELEASE = '6f1c2c3e-1d2b-4c5d-8e9f-0a1b2c3d4e5f';
const SMART_LINK = 'https://jov.ie/release-canary/rel-20261029170000';
function pendingRecord(deployedSha: string | null) {
  return JSON.stringify({
    schemaVersion: 1,
    runId: 'rel-20261029170000',
    releaseId: PREV_RELEASE,
    releaseTitle: 'Release canary rel-20261029170000',
    releaseCreatedAt: CREATED.toISOString(),
    smartLinkUrl: SMART_LINK,
    deployedSha,
  });
}
describe('runReleaseEmailCanary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.store.clear();
    h.selectResults.length = 0;
    for (const key of Object.keys(h.env)) delete h.env[key];
    h.upsertRelease.mockImplementation(async (input: { slug: string }) => ({
      id: 'b2a1c3d4-0000-4000-8000-0000000000aa',
      slug: input.slug,
      createdAt: NOW,
    }));
    h.upsertProviderLink.mockResolvedValue({});
  });
  it('records a not_configured receipt and writes nothing when unconfigured', async () => {
    const receipt = await runReleaseEmailCanary(NOW);
    expect(receipt).toMatchObject({
      status: 'failed',
      failureReason: 'not_configured',
    });
    expect(h.upsertRelease).not.toHaveBeenCalled();
    expect(await getReleaseEmailCanaryStatus()).toMatchObject({
      failureReason: 'not_configured',
    });
  });
  it('refuses a profile not owned by the synthetic canary artist', async () => {
    h.env.RELEASE_EMAIL_CANARY_PROFILE_ID = PROFILE_ID;
    h.env.RELEASE_EMAIL_CANARY_INBOX = INBOX;
    h.selectResults.push([
      { username: 'someone', isClaimed: true, ownerEmail: 'artist@gmail.com' },
    ]);
    const receipt = await runReleaseEmailCanary(NOW);
    expect(receipt.failureReason).toBe('canary_profile_invalid');
    expect(h.upsertRelease).not.toHaveBeenCalled();
    expect(h.captureError).toHaveBeenCalled();
  });
  it('evaluates the previous run as passed and triggers the next canary release', async () => {
    h.env.RELEASE_EMAIL_CANARY_PROFILE_ID = PROFILE_ID;
    h.env.RELEASE_EMAIL_CANARY_INBOX = INBOX;
    h.env.RESEND_INBOUND_WEBHOOK_SECRET = 'set';
    h.env.VERCEL_GIT_COMMIT_SHA = 'deadbeef';
    h.store.set(
      RELEASE_EMAIL_CANARY_PENDING_REDIS_KEY,
      pendingRecord('deadbeef')
    );
    h.selectResults.push(
      [{ username: 'release-canary', isClaimed: true, ownerEmail: ARTIST }],
      [
        {
          id: 'n1',
          status: 'sent',
          createdAt: new Date(CREATED.getTime() + 60_000),
          sentAt: new Date(CREATED.getTime() + 90_000),
        },
      ],
      [{ providerMessageId: 're_1' }],
      [
        {
          receivedAt: new Date(CREATED.getTime() + 120_000),
          subject: 'New: Release canary rel-20261029170000',
          bodyHtml: `<a href="${SMART_LINK}">x</a> unsubscribe`,
        },
      ]
    );
    const receipt = await runReleaseEmailCanary(NOW);
    expect(receipt).toMatchObject({
      status: 'passed',
      deployedSha: 'deadbeef',
      notificationId: 'n1',
      providerMessageId: 're_1',
      nextRunId: 'rel-20261029180000',
      latenciesMs: { schedule: 60_000, send: 30_000, delivered: 30_000 },
    });
    expect(h.upsertRelease).toHaveBeenCalledWith(
      expect.objectContaining({
        creatorProfileId: PROFILE_ID,
        sourceType: 'ingested',
        releaseDate: NOW,
      })
    );
    expect(h.upsertProviderLink).toHaveBeenCalledOnce();
    expect(
      JSON.parse(h.store.get(RELEASE_EMAIL_CANARY_REDIS_KEY) ?? '{}')
    ).toMatchObject({ status: 'passed' });
    expect(
      JSON.parse(h.store.get(RELEASE_EMAIL_CANARY_PENDING_REDIS_KEY) ?? '{}')
    ).toMatchObject({ runId: 'rel-20261029180000' });
  });
  it('reports inbox_unavailable until the inbound webhook secret is configured', async () => {
    h.env.RELEASE_EMAIL_CANARY_PROFILE_ID = PROFILE_ID;
    h.env.RELEASE_EMAIL_CANARY_INBOX = INBOX;
    h.store.set(RELEASE_EMAIL_CANARY_PENDING_REDIS_KEY, pendingRecord(null));
    h.selectResults.push(
      [{ username: 'release-canary', isClaimed: true, ownerEmail: ARTIST }],
      [{ id: 'n1', status: 'sent', createdAt: CREATED, sentAt: NOW }],
      [{ providerMessageId: 're_1' }]
    );
    const receipt = await runReleaseEmailCanary(NOW);
    expect(receipt.failureReason).toBe('inbox_unavailable');
    expect(receipt.providerMessageId).toBe('re_1');
  });
});
