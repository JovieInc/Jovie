import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRecord, mockLimit } = vi.hoisted(() => ({
  mockRecord: vi.fn(),
  mockLimit: vi.fn(),
}));

vi.mock('@/lib/acquisition/proof-claim-funnel.server', () => ({
  recordProofClaimFunnelEvent: mockRecord,
}));

vi.mock('@/lib/rate-limit', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/rate-limit')>();
  return {
    ...actual,
    trackingIpClicksLimiter: {
      limit: mockLimit,
    },
  };
});

vi.mock('@/lib/utils/ip-extraction', () => ({
  extractClientIP: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
  getSafeErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

const { POST } = await import('./route');

function buildRequest(body: unknown) {
  return new NextRequest('http://localhost/api/acquisition/proof-claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/acquisition/proof-claim', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecord.mockResolvedValue(undefined);
    mockLimit.mockResolvedValue({
      success: true,
      limit: 100,
      remaining: 99,
      reset: new Date(Date.now() + 60_000),
    });
  });

  it('accepts a stable funnel event and records it', async () => {
    const response = await POST(
      buildRequest({
        eventType: 'claim_started',
        destination: '/waitlist?campaign=proof-to-claim',
        label: 'Request access',
      })
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ ok: true });
    expect(mockRecord).toHaveBeenCalledWith('claim_started', {
      destination: '/waitlist?campaign=proof-to-claim',
      label: 'Request access',
      profileHandle: undefined,
    });
  });

  it('rejects unknown event names', async () => {
    const response = await POST(buildRequest({ eventType: 'profile_view' }));
    expect(response.status).toBe(400);
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it('returns 429 when the tracking limiter rejects the IP', async () => {
    mockLimit.mockResolvedValueOnce({
      success: false,
      limit: 100,
      remaining: 0,
      reset: new Date(Date.now() + 30_000),
    });

    const response = await POST(buildRequest({ eventType: 'proof_viewed' }));
    expect(response.status).toBe(429);
    expect(mockRecord).not.toHaveBeenCalled();
  });
});
