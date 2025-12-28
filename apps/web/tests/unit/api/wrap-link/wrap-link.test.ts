import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/utils/rate-limit', () => ({
  checkRateLimit: vi.fn().mockReturnValue(false),
  createRateLimitHeaders: vi.fn().mockReturnValue({}),
  getClientIP: vi.fn().mockReturnValue('127.0.0.1'),
  getRateLimitStatus: vi.fn().mockReturnValue({
    limit: 100,
    remaining: 99,
    resetTime: Date.now() + 60000,
  }),
}));

vi.mock('@/lib/url/encryption', () => ({
  encryptUrl: vi.fn().mockReturnValue('encrypted_url_token'),
  decryptUrl: vi.fn().mockReturnValue('https://example.com'),
}));

describe('POST /api/wrap-link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns 400 for invalid URL', async () => {
    const { POST } = await import('@/app/api/wrap-link/route');
    const request = new NextRequest('http://localhost/api/wrap-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'not-a-valid-url' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBeDefined();
  });

  it('wraps valid URL successfully', async () => {
    const { POST } = await import('@/app/api/wrap-link/route');
    const request = new NextRequest('http://localhost/api/wrap-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://example.com/path',
        profileId: 'profile_123',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.wrappedUrl).toBeDefined();
  });
});
