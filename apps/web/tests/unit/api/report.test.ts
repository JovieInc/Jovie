import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCreateFeedbackItem = vi.hoisted(() => vi.fn());
const mockPublicClickLimiterLimit = vi.hoisted(() => vi.fn());
const mockAllowIfRateLimitBackendDegraded = vi.hoisted(() =>
  vi.fn((result: unknown) => result)
);
const mockGetClientIP = vi.hoisted(() => vi.fn());
const mockCreateRateLimitHeaders = vi.hoisted(() => vi.fn());

vi.mock('@/lib/feedback', () => ({
  createFeedbackItem: mockCreateFeedbackItem,
}));

vi.mock('@/lib/rate-limit', () => ({
  allowIfRateLimitBackendDegraded: mockAllowIfRateLimitBackendDegraded,
  createRateLimitHeaders: mockCreateRateLimitHeaders,
  getClientIP: mockGetClientIP,
  publicClickLimiter: { limit: mockPublicClickLimiterLimit },
}));

vi.mock('@/lib/utils/bot-detection', () => ({
  detectBot: vi.fn().mockReturnValue({ isBot: false }),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from '@/app/api/report/route';

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/report', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClientIP.mockReturnValue('127.0.0.1');
    mockPublicClickLimiterLimit.mockResolvedValue({ success: true });
    mockAllowIfRateLimitBackendDegraded.mockImplementation(
      (result: unknown) => result
    );
    mockCreateRateLimitHeaders.mockReturnValue({});
    mockCreateFeedbackItem.mockResolvedValue({ id: 'r1' });
  });

  it('accepts a valid abuse report and returns a generic confirmation', async () => {
    const response = await POST(
      makeRequest({
        targetType: 'profile',
        target: 'somehandle',
        category: 'phishing',
        details: 'pretends to be a lottery',
      })
    );
    const data = await response.json();

    expect(response.status).toBe(202);
    expect(data.ok).toBe(true);
    expect(data.message).toBeTruthy();
    // No internal state exposed to the reporter
    expect(data.id).toBeUndefined();
    expect(data.status).toBeUndefined();

    expect(mockCreateFeedbackItem).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'abuse_report',
        context: expect.objectContaining({
          report: expect.objectContaining({
            targetType: 'profile',
            target: 'somehandle',
            category: 'phishing',
          }),
        }),
      })
    );
  });

  it('accepts the security category for wrapped links', async () => {
    const response = await POST(
      makeRequest({
        targetType: 'wrapped_link',
        target: 'abc123',
        category: 'security',
      })
    );

    expect(response.status).toBe(202);
    expect(mockCreateFeedbackItem).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          report: expect.objectContaining({
            category: 'security',
            target: 'abc123',
          }),
        }),
      })
    );
  });

  it('rejects invalid categories', async () => {
    const response = await POST(
      makeRequest({
        targetType: 'profile',
        target: 'somehandle',
        category: 'nonsense',
      })
    );

    expect(response.status).toBe(400);
    expect(mockCreateFeedbackItem).not.toHaveBeenCalled();
  });

  it('rejects missing target', async () => {
    const response = await POST(
      makeRequest({ targetType: 'profile', category: 'abuse' })
    );

    expect(response.status).toBe(400);
    expect(mockCreateFeedbackItem).not.toHaveBeenCalled();
  });

  it('returns 429 when rate limited', async () => {
    mockPublicClickLimiterLimit.mockResolvedValue({ success: false });

    const response = await POST(
      makeRequest({
        targetType: 'profile',
        target: 'somehandle',
        category: 'abuse',
      })
    );

    expect(response.status).toBe(429);
    expect(mockCreateFeedbackItem).not.toHaveBeenCalled();
  });
});
