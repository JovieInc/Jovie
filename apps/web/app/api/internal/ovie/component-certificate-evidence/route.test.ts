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
vi.mock('@/lib/ovie/certifications/component-certificate-ledger', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/ovie/certifications/component-certificate-ledger')
  >('@/lib/ovie/certifications/component-certificate-ledger');
  return { ...actual, recordComponentCertificateReport: recordMock };
});
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn() } }));

import { ComponentCertificatePersistenceError } from '@/lib/ovie/certifications/component-certificate-ledger';
import { POST } from './route';

const SHA = 'c'.repeat(40);

function body(overrides: Record<string, unknown> = {}) {
  return {
    report: {
      schema: 'jovie.component-certificate-report/v1',
      generatedAt: '2026-10-25T10:00:00.000Z',
      headSha: SHA,
      totals: {
        components: 1,
        certified: 0,
        byCriterion: { journeys: { pass: 0, fail: 1, unknown: 0, na: 0 } },
      },
      certificates: [
        {
          component: 'apps/web/components/Bad.tsx',
          certified: false,
          passing: 0,
          criteria: [
            {
              id: 'journeys',
              status: 'fail',
              journeys: ['signup'],
              uncovered: ['signup'],
            },
          ],
          missing: [{ criterion: 'journeys', reason: 'r', how: 'h' }],
          binding: 'x',
        },
      ],
      ...overrides,
    },
    guards: {
      errors: [],
      total: 2,
      guardsLanded: 1,
      guardCoverage: 0.5,
      weeks: { '2026-W43': { human: 2, guard: 0, agent: 0 } },
    },
  };
}

function post(payload: unknown) {
  return POST(
    new Request(
      'https://jov.ie/api/internal/ovie/component-certificate-evidence',
      {
        method: 'POST',
        headers: { authorization: 'Bearer secret' },
        body: typeof payload === 'string' ? payload : JSON.stringify(payload),
      }
    )
  );
}

describe('POST /api/internal/ovie/component-certificate-evidence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyCronRequestMock.mockReturnValue(null);
    recordMock.mockResolvedValue({ status: 'recorded' });
  });

  it('rejects unauthenticated callers before reading the body', async () => {
    verifyCronRequestMock.mockReturnValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );
    expect((await post(body())).status).toBe(401);
    expect(recordMock).not.toHaveBeenCalled();
  });

  it('slims the report to what Ovie renders and records it', async () => {
    const response = await post(body());
    expect(response.status).toBe(200);
    const ingest = recordMock.mock.calls[0][0].ingest;
    expect(ingest.report.certificates[0]).toEqual({
      component: 'apps/web/components/Bad.tsx',
      certified: false,
      journeys: ['signup'],
      criteria: [{ id: 'journeys', status: 'fail' }],
      missing: [{ criterion: 'journeys', reason: 'r' }],
    });
    expect(ingest.guards.total).toBe(2);
  });

  it('rejects a foreign schema, a short head SHA and unknown fields', async () => {
    expect((await post(body({ schema: 'other/v1' }))).status).toBe(400);
    expect((await post(body({ headSha: 'abc123' }))).status).toBe(400);
    expect((await post({ ...body(), extra: true })).status).toBe(400);
    expect(recordMock).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON', async () => {
    expect((await post('{nope')).status).toBe(400);
  });

  it('maps a ledger rejection to 422 and an outage to 503', async () => {
    recordMock.mockRejectedValueOnce(
      new ComponentCertificatePersistenceError('totals disagree')
    );
    expect((await post(body())).status).toBe(422);
    recordMock.mockRejectedValueOnce(new Error('db down'));
    expect((await post(body())).status).toBe(503);
  });

  it('reports a replayed stale report as ok', async () => {
    recordMock.mockResolvedValueOnce({ status: 'stale' });
    const response = await post(body());
    expect(await response.json()).toEqual({ ok: true, status: 'stale' });
  });
});
