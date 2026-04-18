import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetCachedAuth = vi.hoisted(() => vi.fn());
const mockCheckWrapLinkRateLimit = vi.hoisted(() => vi.fn());
const mockCreateRateLimitHeaders = vi.hoisted(() => vi.fn());
const mockCreateWrappedLink = vi.hoisted(() => vi.fn());
const mockGetClientIP = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mockGetCachedAuth,
}));

vi.mock('@/lib/rate-limit', () => ({
  checkWrapLinkRateLimit: mockCheckWrapLinkRateLimit,
  createRateLimitHeaders: mockCreateRateLimitHeaders,
  getClientIP: mockGetClientIP,
}));

vi.mock('@/lib/services/link-wrapping', () => ({
  createWrappedLink: mockCreateWrappedLink,
}));

vi.mock('@/lib/utils/bot-detection', () => ({
  detectBot: vi.fn().mockReturnValue({ isBot: false }),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from '@/app/api/wrap-link/route';

describe('POST /api/wrap-link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCachedAuth.mockResolvedValue({ userId: null });
    mockGetClientIP.mockReturnValue('127.0.0.1');
    mockCheckWrapLinkRateLimit.mockResolvedValue({ success: true });
    mockCreateRateLimitHeaders.mockReturnValue({});
  });

  it('returns 400 for invalid URL', async () => {
    const request = new NextRequest('http://localhost/api/wrap-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'not-a-valid-url' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBeDefined();
    expect(mockCreateWrappedLink).not.toHaveBeenCalled();
  });

  it('wraps valid URL successfully', async () => {
    mockCreateWrappedLink.mockResolvedValue({
      shortId: 'abc123',
      kind: 'wrapped',
      domain: 'jov.ie',
      category: 'external',
      titleAlias: null,
      createdAt: new Date().toISOString(),
      expiresAt: null,
    });

    const request = new NextRequest('http://localhost/api/wrap-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://example.com/path',
        platform: 'external',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockCreateWrappedLink).toHaveBeenCalledWith({
      customAlias: undefined,
      expiresInHours: undefined,
      url: 'https://example.com/path',
      userId: undefined,
    });
    expect(data.normalUrl).toBe('/go/abc123');
    expect(data.sensitiveUrl).toBe('/out/abc123');
  });
});
