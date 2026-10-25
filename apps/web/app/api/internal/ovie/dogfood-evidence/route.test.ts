import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { verifyCronRequestMock, recordMock } = vi.hoisted(() => ({
  verifyCronRequestMock: vi.fn(),
  recordMock: vi.fn(),
}));

vi.mock('@/lib/cron/auth', () => ({
  verifyCronRequest: verifyCronRequestMock,
}));
vi.mock('@/lib/ovie/mcp/postgres-backend', () => ({
  postgresRecordBackend: () => ({}),
}));
vi.mock(
  '@/lib/ovie/certifications/prod-dogfood-ledger',
  async importOriginal => ({
    ...(await importOriginal<
      typeof import('@/lib/ovie/certifications/prod-dogfood-ledger')
    >()),
    recordProdDogfoodRun: recordMock,
  })
);
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn() } }));

import { ProdDogfoodPersistenceError } from '@/lib/ovie/certifications/prod-dogfood-ledger';
import { POST } from './route';

const SHA = 'a'.repeat(40);

function mission(overrides: Record<string, unknown> = {}) {
  return {
    missionId: 'dogfood:public-profile',
    subjectId: 'public-profile',
    product: 'jov',
    title: 'Fan opens an artist profile',
    status: 'certified',
    commitSha: SHA,
    deploymentId: 'dpl_1',
    completedAt: '2026-10-25T01:01:00.000Z',
    blocker: null,
    owner: null,
    lastCertifiedSha: SHA,
    ...overrides,
  };
}

function body(overrides: Record<string, unknown> = {}) {
  return {
    generatedAt: '2026-10-25T01:02:00.000Z',
    servedSha: SHA,
    runUrl: null,
    missions: [mission()],
    receipts: [{ missionId: 'dogfood:public-profile' }],
    ...overrides,
  };
}

function post(payload: unknown) {
  return POST(
    new Request('https://jov.ie/api/internal/ovie/dogfood-evidence', {
      method: 'POST',
      headers: { authorization: 'Bearer secret' },
      body: JSON.stringify(payload),
    })
  );
}

describe('POST /api/internal/ovie/dogfood-evidence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyCronRequestMock.mockReturnValue(null);
    recordMock.mockResolvedValue({ status: 'recorded' });
  });

  it('rejects unauthenticated callers before touching the store', async () => {
    verifyCronRequestMock.mockReturnValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );
    expect((await post(body())).status).toBe(401);
    expect(recordMock).not.toHaveBeenCalled();
  });

  it('records a valid run', async () => {
    const response = await post(body());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, status: 'recorded' });
  });

  it.each([
    ['an unknown status', { missions: [mission({ status: 'green' })] }],
    ['unknown fields', { founderDecision: 'approved' }],
    ['a short sha', { servedSha: 'abc' }],
    ['no missions', { missions: [] }],
  ])('rejects %s', async (_label, overrides) => {
    expect((await post(body(overrides))).status).toBe(400);
    expect(recordMock).not.toHaveBeenCalled();
  });

  it('maps a persistence rejection to 422', async () => {
    recordMock.mockRejectedValue(
      new ProdDogfoodPersistenceError('certified without a receipt')
    );
    expect((await post(body())).status).toBe(422);
  });
});
