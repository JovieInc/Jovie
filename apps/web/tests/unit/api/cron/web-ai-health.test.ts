import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebAiHealthReceipt } from '@/lib/ai/web-ai-health';

const verifyCronRequestMock = vi.fn();
const runWebAiHealthMock = vi.fn();
const captureErrorMock = vi.fn();
const loggerErrorMock = vi.fn();
const loggerInfoMock = vi.fn();

vi.mock('@/lib/cron/auth', () => ({
  verifyCronRequest: verifyCronRequestMock,
}));

vi.mock('@/lib/ai/web-ai-health', () => ({
  runWebAiHealth: runWebAiHealthMock,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: captureErrorMock,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    error: loggerErrorMock,
    info: loggerInfoMock,
  },
}));

function receipt(status: 'passed' | 'failed'): WebAiHealthReceipt {
  return {
    schema: 'jovie-web-ai-health/v1',
    checkedAt: '2026-09-28T07:00:00.000Z',
    environment: 'production',
    status,
    signal: { severity: 'high', route: 'bug' },
    gatewayAllowlist: {
      name: 'founder-strict-2026-09-17',
      models: ['zai/glm-5.3', 'zai/glm-5.3-flash'],
    },
    results: [
      {
        surface: 'web_chat',
        model: 'zai/glm-5.3',
        ok: status === 'passed',
        failureCause: status === 'passed' ? null : 'empty_stream',
        message:
          status === 'passed'
            ? 'web_chat: non-empty response'
            : 'web_chat: model stream completed without response content',
        durationMs: 10,
      },
    ],
  };
}

describe('GET /api/cron/web-ai-health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyCronRequestMock.mockReturnValue(null);
  });

  it('requires cron auth before spending a model turn', async () => {
    verifyCronRequestMock.mockReturnValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );
    const { GET } = await import('@/app/api/cron/web-ai-health/route');

    const response = await GET(
      new Request('https://jov.ie/api/cron/web-ai-health')
    );

    expect(response.status).toBe(401);
    expect(runWebAiHealthMock).not.toHaveBeenCalled();
  });

  it('returns a no-store 200 receipt when all five surfaces are healthy', async () => {
    runWebAiHealthMock.mockResolvedValue(receipt('passed'));
    const { GET } = await import('@/app/api/cron/web-ai-health/route');

    const response = await GET(
      new Request('https://jov.ie/api/cron/web-ai-health')
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toMatchObject({ status: 'passed' });
  });

  it('returns 503 with the classified receipt when any surface fails', async () => {
    runWebAiHealthMock.mockResolvedValue(receipt('failed'));
    const { GET } = await import('@/app/api/cron/web-ai-health/route');

    const response = await GET(
      new Request('https://jov.ie/api/cron/web-ai-health')
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: 'failed',
      signal: { severity: 'high', route: 'bug' },
      gatewayAllowlist: { name: 'founder-strict-2026-09-17' },
    });
    expect(loggerErrorMock).toHaveBeenCalled();
  });

  it('captures unexpected orchestration failures without exposing details', async () => {
    runWebAiHealthMock.mockRejectedValue(new Error('secret provider detail'));
    const { GET } = await import('@/app/api/cron/web-ai-health/route');

    const response = await GET(
      new Request('https://jov.ie/api/cron/web-ai-health')
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'web_ai_health_unavailable',
    });
    expect(captureErrorMock).toHaveBeenCalledWith(
      'Web AI health canary orchestration failed',
      expect.any(Error),
      expect.objectContaining({ route: '/api/cron/web-ai-health' })
    );
  });
});
