/**
 * Unit tests for the profile view API route.
 *
 * Tests POST /api/profile/view:
 * - Valid view tracking requests
 * - Rate limiting enforcement
 * - Bot detection and filtering
 * - Input validation (Zod schema)
 * - Error handling
 */

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted mocks
const mockIncrementProfileViews = vi.hoisted(() => vi.fn());
const mockGetStatus = vi.hoisted(() => vi.fn());
const mockLimit = vi.hoisted(() => vi.fn());
const mockDetectBot = vi.hoisted(() => vi.fn());
const mockExtractClientIP = vi.hoisted(() => vi.fn());

vi.mock('@/lib/services/profile', () => ({
  incrementProfileViews: mockIncrementProfileViews,
}));

vi.mock('@/lib/rate-limit', () => ({
  publicProfileLimiter: {
    getStatus: mockGetStatus,
    limit: mockLimit,
  },
}));

vi.mock('@/lib/utils/bot-detection', () => ({
  detectBot: mockDetectBot,
}));

vi.mock('@/lib/utils/ip-extraction', () => ({
  extractClientIP: mockExtractClientIP,
}));

vi.mock('@/lib/http/headers', () => ({
  NO_STORE_HEADERS: {
    'Cache-Control': 'no-store',
  },
}));

function createRequest(body: unknown, options: { userAgent?: string } = {}) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (options.userAgent) {
    headers['user-agent'] = options.userAgent;
  }
  return new NextRequest('https://jov.ie/api/profile/view', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('POST /api/profile/view', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExtractClientIP.mockReturnValue('192.168.1.1');
    mockGetStatus.mockReturnValue({
      blocked: false,
      retryAfterSeconds: 0,
      limit: 100,
      remaining: 99,
    });
    mockLimit.mockResolvedValue(undefined);
    mockDetectBot.mockReturnValue({ isBot: false, reason: '' });
    mockIncrementProfileViews.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('successfully tracks a profile view', async () => {
    const { POST } = await import('@/app/api/profile/view/route');
    const request = createRequest({ handle: 'testartist' });
    const response = await POST(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(mockIncrementProfileViews).toHaveBeenCalledWith('testartist');
  });

  it('returns 429 when rate limited', async () => {
    mockGetStatus.mockReturnValue({
      blocked: true,
      retryAfterSeconds: 60,
      limit: 100,
      remaining: 0,
    });

    const { POST } = await import('@/app/api/profile/view/route');
    const request = createRequest({ handle: 'testartist' });
    const response = await POST(request);

    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.error).toBe('Rate limit exceeded');
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(mockIncrementProfileViews).not.toHaveBeenCalled();
  });

  it('filters bot traffic without incrementing views', async () => {
    mockDetectBot.mockReturnValue({
      isBot: true,
      reason: 'Known crawler detected',
    });

    const { POST } = await import('@/app/api/profile/view/route');
    const request = createRequest({ handle: 'testartist' });
    const response = await POST(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.filtered).toBe(true);
    expect(mockIncrementProfileViews).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON body', async () => {
    const request = new NextRequest('https://jov.ie/api/profile/view', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    });

    const { POST } = await import('@/app/api/profile/view/route');
    const response = await POST(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid JSON');
  });

  it('returns 400 for missing handle field', async () => {
    const { POST } = await import('@/app/api/profile/view/route');
    const request = createRequest({});
    const response = await POST(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid payload');
  });

  it('returns 400 for empty handle string', async () => {
    const { POST } = await import('@/app/api/profile/view/route');
    const request = createRequest({ handle: '' });
    const response = await POST(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid payload');
  });

  it('returns 400 for handle exceeding 100 chars', async () => {
    const { POST } = await import('@/app/api/profile/view/route');
    const request = createRequest({ handle: 'a'.repeat(101) });
    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it('returns 500 when incrementProfileViews throws', async () => {
    mockIncrementProfileViews.mockRejectedValue(
      new Error('Database connection lost')
    );

    const { POST } = await import('@/app/api/profile/view/route');
    const request = createRequest({ handle: 'testartist' });
    const response = await POST(request);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe('Failed to record view');
  });

  it('includes no-store cache headers in all responses', async () => {
    const { POST } = await import('@/app/api/profile/view/route');
    const request = createRequest({ handle: 'testartist' });
    const response = await POST(request);

    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('calls rate limiter with extracted client IP', async () => {
    mockExtractClientIP.mockReturnValue('10.0.0.1');

    const { POST } = await import('@/app/api/profile/view/route');
    const request = createRequest({ handle: 'testartist' });
    await POST(request);

    expect(mockGetStatus).toHaveBeenCalledWith('10.0.0.1');
  });

  it('accepts valid handle at max length (100 chars)', async () => {
    const { POST } = await import('@/app/api/profile/view/route');
    const request = createRequest({ handle: 'a'.repeat(100) });
    const response = await POST(request);

    expect(response.status).toBe(200);
  });
});
