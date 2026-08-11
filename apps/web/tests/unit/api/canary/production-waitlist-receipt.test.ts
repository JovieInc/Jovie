import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDbSelect = vi.hoisted(() => vi.fn());
const mockDbUpdate = vi.hoisted(() => vi.fn());
const mockDbSet = vi.hoisted(() => vi.fn());
const mockGetCachedAuth = vi.hoisted(() => vi.fn());
const mockGetCachedCurrentUser = vi.hoisted(() => vi.fn());
const mockLoggerError = vi.hoisted(() => vi.fn());

const TABLES = vi.hoisted(() => ({
  users: { name: 'users' },
  baUsers: { name: 'baUsers' },
  baSessions: { name: 'baSessions' },
  ingestionJobs: { name: 'ingestionJobs' },
  userInterviews: { name: 'userInterviews' },
  waitlistAuditLogs: { name: 'waitlistAuditLogs' },
  waitlistEntries: { name: 'waitlistEntries' },
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mockGetCachedAuth,
  getCachedCurrentUser: mockGetCachedCurrentUser,
}));
vi.mock('@/lib/db', () => ({
  db: { select: mockDbSelect, update: mockDbUpdate },
}));
vi.mock('@/lib/db/schema/auth', () => ({ users: TABLES.users }));
vi.mock('@/lib/db/schema/better-auth', () => ({
  baSessions: TABLES.baSessions,
  baUsers: TABLES.baUsers,
}));
vi.mock('@/lib/db/schema/ingestion', () => ({
  ingestionJobs: TABLES.ingestionJobs,
}));
vi.mock('@/lib/db/schema/user-interviews', () => ({
  userInterviews: TABLES.userInterviews,
}));
vi.mock('@/lib/db/schema/waitlist', () => ({
  waitlistAuditLogs: TABLES.waitlistAuditLogs,
  waitlistEntries: TABLES.waitlistEntries,
}));
vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions: unknown[]) => conditions),
  desc: vi.fn((column: unknown) => column),
  eq: vi.fn((column: unknown, value: unknown) => [column, value]),
  gt: vi.fn((column: unknown, value: unknown) => [column, value]),
  like: vi.fn((column: unknown, value: unknown) => [column, value]),
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { error: mockLoggerError },
}));

import { GET, POST } from '@/app/api/canary/waitlist/receipt/route';

const TOKEN = 'r'.repeat(32);
const ENTRY_ID = '11111111-1111-4111-8111-111111111111';
const MARKER = {
  schemaVersion: 1,
  name: 'production-waitlist',
  runId: '123-1',
  communications: {
    waitlistConfirmationEmail: 'suppressed-before-enqueue',
    slack: 'suppressed',
  },
};
const ANALYTICS_RECEIPT = {
  schemaVersion: 1,
  name: 'production-waitlist',
  runId: '123-1',
  event: 'waitlist_confirmation_viewed',
};

const COMPLETE_ROWS = new Map<unknown, unknown[]>([
  [TABLES.baUsers, [{ id: 'ba-user-1' }]],
  [
    TABLES.users,
    [
      {
        id: 'app-user-1',
        waitlistEntryId: ENTRY_ID,
        userStatus: 'waitlist_pending',
      },
    ],
  ],
  [TABLES.baSessions, [{ id: 'session-1' }]],
  [
    TABLES.waitlistEntries,
    [
      {
        id: ENTRY_ID,
        status: 'waitlisted',
        source: 'onboarding_chat',
        canonical: true,
      },
    ],
  ],
  [TABLES.waitlistAuditLogs, [{ metadata: { syntheticCanary: MARKER } }]],
  [
    TABLES.userInterviews,
    [
      {
        metadata: {
          syntheticCanary: { ...MARKER, runId: '123-0' },
          syntheticAnalyticsReceipt: {
            ...ANALYTICS_RECEIPT,
            runId: '123-0',
          },
          waitlistEntryId: ENTRY_ID,
          accessOutcome: 'already_waitlisted',
        },
      },
      {
        metadata: {
          syntheticCanary: MARKER,
          syntheticAnalyticsReceipt: ANALYTICS_RECEIPT,
          waitlistEntryId: ENTRY_ID,
          accessOutcome: 'waitlisted_gate_on',
        },
      },
    ],
  ],
  [TABLES.ingestionJobs, []],
]);

function request(path: string, authorized = true): Request {
  return new Request(`https://jov.ie${path}`, {
    headers: authorized ? { authorization: `Bearer ${TOKEN}` } : {},
  });
}

function installDbRows(rows: Map<unknown, unknown[]> = COMPLETE_ROWS) {
  mockDbSelect.mockImplementation(() => ({
    from: (table: unknown) => ({
      where: () => {
        const result = rows.get(table) ?? [];
        return {
          limit: async () => result,
          orderBy: () => ({ limit: async () => result }),
        };
      },
    }),
  }));
  mockDbSet.mockReturnValue({ where: async () => undefined });
  mockDbUpdate.mockReturnValue({ set: mockDbSet });
}

describe('GET /api/canary/waitlist/receipt', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('E2E_PROD_SIGNUP_EMAIL_BASE', 'synthetic@e2e.example.com');
    vi.stubEnv('PRODUCTION_WAITLIST_CANARY_READ_TOKEN', TOKEN);
    mockGetCachedAuth.mockResolvedValue({ userId: 'app-user-1' });
    mockGetCachedCurrentUser.mockResolvedValue({
      primaryEmailAddress: {
        emailAddress: 'synthetic+jovie-prod-waitlist-canary@e2e.example.com',
      },
    });
    installDbRows();
  });

  it('fails closed when production configuration is absent', async () => {
    vi.stubEnv('PRODUCTION_WAITLIST_CANARY_READ_TOKEN', '');
    const response = await GET(request('?mode=preflight'));
    expect(response.status).toBe(503);
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it('rejects unauthorized reads without touching the database', async () => {
    const response = await GET(request('?mode=preflight', false));
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it('preflights the redacted identity and suppression policy', async () => {
    const response = await GET(request('?mode=preflight'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      canary: 'production-waitlist',
      environment: 'production',
      assertions: { communicationsFailClosed: 'passed' },
    });
    expect(JSON.stringify(body)).not.toContain('synthetic+');
  });

  it('returns a complete redacted durable receipt', async () => {
    const response = await GET(request(`?run_id=123-1&entry_id=${ENTRY_ID}`));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      entryId: ENTRY_ID,
      assertions: {
        database: { waitlistEntry: 'passed', waitlistAudit: 'passed' },
        analytics: { firstPartyWaitlistConfirmation: 'passed' },
        communications: { emailJobCount: 0 },
      },
    });
    expect(JSON.stringify(body)).not.toContain('synthetic+');
  });

  it('accepts the current run among retained prior interview receipts', async () => {
    const response = await GET(request(`?run_id=123-1&entry_id=${ENTRY_ID}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ runId: '123-1' });
  });

  it('returns conflict when any outbound email job exists', async () => {
    const rows = new Map(COMPLETE_ROWS);
    rows.set(TABLES.ingestionJobs, [{ id: 'unexpected-job' }]);
    installDbRows(rows);
    const response = await GET(request(`?run_id=123-1&entry_id=${ENTRY_ID}`));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      status: 'incomplete',
      missing: expect.arrayContaining(['email_job_suppression']),
    });
  });

  it.each([
    ['missing identity', TABLES.baUsers, [], ['identity_linkage', 'session']],
    [
      'duplicate identity',
      TABLES.baUsers,
      [{ id: 'ba-user-1' }, { id: 'ba-user-2' }],
      ['identity_linkage', 'session'],
    ],
    ['missing active session', TABLES.baSessions, [], ['session']],
    [
      'non-waitlisted entry',
      TABLES.waitlistEntries,
      [
        {
          id: ENTRY_ID,
          status: 'approved',
          source: 'onboarding_chat',
          canonical: true,
        },
      ],
      ['waitlist_entry'],
    ],
    ['missing audit marker', TABLES.waitlistAuditLogs, [], ['waitlist_audit']],
    [
      'mismatched interview marker',
      TABLES.userInterviews,
      [
        {
          metadata: {
            syntheticCanary: { ...MARKER, runId: '123-2' },
            waitlistEntryId: ENTRY_ID,
            accessOutcome: 'waitlisted_gate_on',
          },
        },
      ],
      ['analytics_receipt'],
    ],
    [
      'missing rendered analytics receipt',
      TABLES.userInterviews,
      [
        {
          metadata: {
            syntheticCanary: MARKER,
            waitlistEntryId: ENTRY_ID,
            accessOutcome: 'waitlisted_gate_on',
          },
        },
      ],
      ['analytics_receipt'],
    ],
  ] as const)('returns conflict for %s evidence', async (_label, table, result, expectedMissing) => {
    const rows = new Map(COMPLETE_ROWS);
    rows.set(table, [...result]);
    installDbRows(rows);

    const response = await GET(request(`?run_id=123-1&entry_id=${ENTRY_ID}`));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      status: 'incomplete',
      missing: expect.arrayContaining([...expectedMissing]),
    });
  });

  it('rejects malformed entry ids before any database read', async () => {
    const response = await GET(request('?run_id=123-1&entry_id=unsafe'));
    expect(response.status).toBe(400);
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it('records a run-bound first-party analytics receipt for the exact identity', async () => {
    const rows = new Map(COMPLETE_ROWS);
    rows.set(TABLES.userInterviews, [
      {
        id: 'interview-1',
        metadata: {
          syntheticCanary: MARKER,
          waitlistEntryId: ENTRY_ID,
          accessOutcome: 'waitlisted_gate_on',
        },
      },
    ]);
    installDbRows(rows);

    const response = await POST(
      new Request('https://jov.ie/api/canary/waitlist/receipt', {
        method: 'POST',
        headers: { 'x-jovie-waitlist-canary-run-id': '123-1' },
      })
    );

    expect(response.status).toBe(200);
    expect(mockDbUpdate).toHaveBeenCalledWith(TABLES.userInterviews);
    expect(mockDbSet).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          syntheticAnalyticsReceipt: ANALYTICS_RECEIPT,
        }),
      })
    );
    expect(await response.json()).toMatchObject({
      runId: '123-1',
      event: 'waitlist_confirmation_viewed',
      status: 'recorded',
    });
  });

  it('refuses analytics receipt writes for non-canary identities', async () => {
    mockGetCachedCurrentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: 'customer@example.com' },
    });

    const response = await POST(
      new Request('https://jov.ie/api/canary/waitlist/receipt', {
        method: 'POST',
        headers: { 'x-jovie-waitlist-canary-run-id': '123-1' },
      })
    );

    expect(response.status).toBe(403);
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });
});
