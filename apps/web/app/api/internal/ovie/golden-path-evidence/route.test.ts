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
  '@/lib/ovie/certifications/prod-golden-path-ledger',
  async importOriginal => ({
    ...(await importOriginal<
      typeof import('@/lib/ovie/certifications/prod-golden-path-ledger')
    >()),
    recordProdGoldenPathRun: recordMock,
  })
);
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn() } }));

import { ProdGoldenPathPersistenceError } from '@/lib/ovie/certifications/prod-golden-path-ledger';
import { POST } from './route';

const SHA = 'b'.repeat(40);
const T0 = '2026-10-28T20:00:00.000Z';
const T1 = '2026-10-28T20:00:05.000Z';

function receipt(overrides: Record<string, unknown> = {}) {
  return {
    schema: 'jovie.prod-golden-path-receipt/v1',
    surface: 'landing',
    status: 'passed',
    sha: SHA,
    deploymentId: 'dpl_1',
    startedAt: T0,
    endedAt: T1,
    runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/1',
    screenIds: ['web.homepage'],
    identity: 'anonymous',
    checks: [
      {
        id: 'landing-renders',
        status: 'passed',
        startedAt: T0,
        endedAt: T1,
        summary: 'ok',
      },
    ],
    blocker: null,
    issueUrl: null,
    observations: [],
    ...overrides,
  };
}

function post(payload: unknown) {
  return POST(
    new Request('https://jov.ie/api/internal/ovie/golden-path-evidence', {
      method: 'POST',
      headers: { authorization: 'Bearer secret' },
      body: JSON.stringify(payload),
    })
  );
}

describe('POST /api/internal/ovie/golden-path-evidence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyCronRequestMock.mockReturnValue(null);
    recordMock.mockResolvedValue({ recorded: ['landing'], stale: [] });
  });

  it('rejects unauthenticated callers before touching the store', async () => {
    verifyCronRequestMock.mockReturnValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );
    expect((await post({ receipts: [receipt()] })).status).toBe(401);
    expect(recordMock).not.toHaveBeenCalled();
  });

  it('records a valid run', async () => {
    const response = await post({ receipts: [receipt()] });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      recorded: ['landing'],
      stale: [],
    });
  });

  it.each([
    ['an unknown surface', { receipts: [receipt({ surface: 'billing' })] }],
    ['a short sha', { receipts: [receipt({ sha: 'abc' })] }],
    ['no receipts', { receipts: [] }],
    ['unknown fields', { receipts: [receipt()], founderDecision: 'approved' }],
  ])('rejects %s', async (_label, payload) => {
    expect((await post(payload)).status).toBe(400);
    expect(recordMock).not.toHaveBeenCalled();
  });

  it('maps a persistence rejection to 422', async () => {
    recordMock.mockRejectedValue(new ProdGoldenPathPersistenceError('bad'));
    expect((await post({ receipts: [receipt()] })).status).toBe(422);
  });
  it('records a receipt carrying per-surface browser evidence (JOV-9625)', async () => {
    const response = await post({
      receipts: [
        receipt({
          consoleErrorCount: 0,
          networkErrorCount: 2,
          screenshot: {
            format: 'jpeg',
            dataUrl: 'data:image/jpeg;base64,frame',
          },
        }),
      ],
    });
    expect(response.status).toBe(200);
    expect(recordMock).toHaveBeenCalledTimes(1);
    const stored = recordMock.mock.calls[0][0].receipts[0];
    expect(stored.consoleErrorCount).toBe(0);
    expect(stored.networkErrorCount).toBe(2);
    expect(stored.screenshot.dataUrl).toBe('data:image/jpeg;base64,frame');
  });

  it('records the admin inventory readback as receipt evidence (JOV-9625)', async () => {
    const response = await post({
      receipts: [
        receipt({
          adminInventoryReadback: {
            status: 'blocked',
            detail:
              'GET /api/ovie/certifications returned HTTP 403 for browse-admin+clerk_test@jov.ie — the fixture is not an admin in production',
          },
        }),
      ],
    });
    expect(response.status).toBe(200);
    const stored = recordMock.mock.calls[0][0].receipts[0];
    expect(stored.adminInventoryReadback.status).toBe('blocked');
  });

  it('rejects a malformed screenshot payload (JOV-9625)', async () => {
    const response = await post({
      receipts: [
        receipt({
          screenshot: {
            format: 'png',
            dataUrl: 'data:image/png;base64,frame',
          },
        }),
      ],
    });
    expect(response.status).toBe(400);
    expect(recordMock).not.toHaveBeenCalled();
  });
});
