import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { recordMock, verifyCronRequestMock } = vi.hoisted(() => ({
  recordMock: vi.fn(),
  verifyCronRequestMock: vi.fn(),
}));

vi.mock('@/lib/cron/auth', () => ({
  verifyCronRequest: verifyCronRequestMock,
}));
vi.mock('@/lib/agent-os/component-certificate-ingest', () => ({
  recordComponentCertificateDelivery: recordMock,
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));

import { OPTIONS, POST } from './route';

const HEAD_SHA = 'a'.repeat(40);

function packet(overrides: Record<string, unknown> = {}) {
  return {
    artifactName: 'component-certificate-123',
    evaluatedAt: '2026-11-13T00:00:00.000Z',
    failingComponents: [
      {
        applicable: 10,
        component: 'packages/ui/atoms/alert-dialog.tsx',
        passing: 8,
      },
    ],
    failingComponentsTotal: 1,
    headSha: HEAD_SHA,
    reportBytes: 4_500_000,
    runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/123',
    schema: 'jovie.component-certificate-evidence/v1',
    totals: {
      byCriterion: { tests: { fail: 1, na: 0, pass: 9, unknown: 0 } },
      certified: 0,
      components: 1,
    },
    ...overrides,
  };
}

function post(body: unknown) {
  return POST(
    new NextRequest(
      'https://jov.ie/api/internal/ovie/component-certificate-evidence',
      {
        method: 'POST',
        headers: { authorization: 'Bearer secret' },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }
    )
  );
}

describe('POST /api/internal/ovie/component-certificate-evidence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyCronRequestMock.mockReturnValue(null);
    recordMock.mockResolvedValue({
      accepted: true,
      reason: 'stored',
      historyCount: 1,
      key: 'component-certificate:source-ordered-latest/v1',
      packet: { headSha: HEAD_SHA },
    });
  });

  it('rejects unauthenticated callers before reading the body', async () => {
    verifyCronRequestMock.mockReturnValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );
    const response = await post('{invalid-json');
    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(recordMock).not.toHaveBeenCalled();
  });

  it('rejects a body over the bounded cap with 413 before parsing', async () => {
    const oversized = JSON.stringify(
      packet({ failingComponents: undefined })
    ).replace(
      '"failingComponentsTotal":1',
      `"failingComponentsTotal":1,"pad":"${'x'.repeat(64 * 1024)}"`
    );
    const response = await post(oversized);
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Request body too large',
    });
    expect(recordMock).not.toHaveBeenCalled();
  });

  it('cancels an oversized stream before reading the whole request', async () => {
    const cancel = vi.fn();
    let pulls = 0;
    const body = new ReadableStream({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(32 * 1024));
        if (pulls === 10) controller.close();
      },
      cancel,
    });
    const request = new NextRequest(
      'https://jov.ie/api/internal/ovie/component-certificate-evidence',
      { method: 'POST', body, duplex: 'half' }
    );
    const response = await POST(request);
    expect(response.status).toBe(413);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(pulls).toBeLessThan(10);
    expect(recordMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid packet with 400', async () => {
    const response = await post(
      packet({ schema: 'jovie.component-certificate-evidence/v0' })
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'invalid_packet',
    });
    expect(recordMock).not.toHaveBeenCalled();
  });

  it('rejects a malformed-JSON body with 400', async () => {
    const response = await post('{not-json');
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid JSON in request body',
    });
  });

  it('accepts a valid compact packet and persists it', async () => {
    const response = await post(packet());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      historyCount: 1,
      ok: true,
      storedHeadSha: HEAD_SHA,
    });
    expect(recordMock).toHaveBeenCalledTimes(1);
    expect(recordMock.mock.calls[0][0]).toMatchObject({
      headSha: HEAD_SHA,
      schema: 'jovie.component-certificate-evidence/v1',
    });
  });

  const order = {
    schema: 'jovie.source-order/v1',
    sourceOrdinal: 100,
    runNumber: 20,
    runAttempt: 1,
  };
  it('acknowledges the stored order and never echoes a rejected incoming head', async () => {
    const storedHeadSha = 'b'.repeat(40);
    recordMock.mockResolvedValue({
      accepted: false,
      reason: 'stale',
      historyCount: null,
      packet: { headSha: storedHeadSha, deliveryOrder: order },
    });
    const response = await post(packet({ deliveryOrder: order }));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      accepted: false,
      reason: 'stale',
      storedHeadSha,
      deliveryOrder: order,
    });
  });
  it.each([
    { ...order, sourceOrdinal: 0 },
    { ...order, runNumber: Number.MAX_SAFE_INTEGER + 1 },
    { ...order, runAttempt: -1 },
    { ...order, runNumber: '20' },
    { ...order, unexpected: true },
    { ...order, schema: 'unsupported' },
    null,
  ])(
    'rejects malformed ordering before persistence: %j',
    async deliveryOrder => {
      expect((await post(packet({ deliveryOrder }))).status).toBe(400);
      expect(recordMock).not.toHaveBeenCalled();
    }
  );
  it('advertises ordering through authenticated OPTIONS without body or store access', async () => {
    const request = new NextRequest(
      'https://jov.ie/api/internal/ovie/component-certificate-evidence',
      {
        method: 'OPTIONS',
        headers: { authorization: 'Bearer secret' },
        body: '{invalid-json',
      }
    );
    const response = await OPTIONS(request);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      ok: true,
      deliveryOrderSchema: 'jovie.source-order/v1',
    });
    expect(recordMock).not.toHaveBeenCalled();
    expect(request.bodyUsed).toBe(false);
  });
  it('authenticates capability requests before advertising support', async () => {
    verifyCronRequestMock.mockReturnValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );
    const response = await OPTIONS(
      new NextRequest(
        'https://jov.ie/api/internal/ovie/component-certificate-evidence',
        { method: 'OPTIONS' }
      )
    );
    expect(response.status).toBe(401);
    expect(recordMock).not.toHaveBeenCalled();
  });

  it('reports a store failure as 503, not a crash', async () => {
    recordMock.mockRejectedValue(new Error('kv unavailable'));
    const response = await post(packet());
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: 'ingest_failed',
    });
  });
});
