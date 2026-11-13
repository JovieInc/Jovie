/**
 * Real (unmocked) auth integration coverage, mirroring
 * design-ci-judge-evidence/route.auth.test.ts. This exercises the actual
 * verifyCronRequest -> timingSafeMatch -> crypto.timingSafeEqual chain
 * through the real POST handler, so a wiring regression that route.test.ts's
 * mock would mask still fails here.
 */
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { recordMock } = vi.hoisted(() => ({ recordMock: vi.fn() }));

vi.mock('@/lib/agent-os/component-certificate-ingest', () => ({
  recordComponentCertificateDelivery: recordMock,
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));

const HEAD_SHA = 'a'.repeat(40);

function packet() {
  return {
    artifactName: null,
    evaluatedAt: '2026-11-13T00:00:00.000Z',
    failingComponents: [],
    failingComponentsTotal: 0,
    headSha: HEAD_SHA,
    reportBytes: 4_500_000,
    runUrl: null,
    schema: 'jovie.component-certificate-evidence/v1',
    totals: {
      byCriterion: {},
      certified: 0,
      components: 0,
    },
  };
}

async function post(authorization: string | undefined) {
  const { POST } = await import('./route');
  return POST(
    new NextRequest(
      'https://jov.ie/api/internal/ovie/component-certificate-evidence',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(authorization ? { authorization } : {}),
        },
        body: JSON.stringify(packet()),
      }
    )
  );
}

describe('POST /api/internal/ovie/component-certificate-evidence: real auth', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    recordMock.mockClear();
  });

  it('a wrong secret gets 401 through the real auth chain, with no store write', async () => {
    vi.stubEnv('CRON_SECRET', 'the-real-secret');
    const response = await post('Bearer wrong-secret');
    expect(response.status).toBe(401);
    expect(recordMock).not.toHaveBeenCalled();
  });

  it('a missing secret header gets 401 through the real auth chain, with no store write', async () => {
    vi.stubEnv('CRON_SECRET', 'the-real-secret');
    const response = await post(undefined);
    expect(response.status).toBe(401);
    expect(recordMock).not.toHaveBeenCalled();
  });

  it('an unconfigured CRON_SECRET fails closed at 500, not open', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const response = await post('Bearer anything');
    expect(response.status).toBe(500);
    expect(recordMock).not.toHaveBeenCalled();
  });

  it('the real secret is accepted and reaches the store', async () => {
    recordMock.mockResolvedValue({
      historyCount: 1,
      key: 'component-certificate:latest',
      packet: {},
    });
    vi.stubEnv('CRON_SECRET', 'the-real-secret');
    const response = await post('Bearer the-real-secret');
    expect(response.status).toBe(200);
    expect(recordMock).toHaveBeenCalledTimes(1);
  });
});
