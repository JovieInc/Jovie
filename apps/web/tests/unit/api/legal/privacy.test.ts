import { NextResponse } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

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

vi.mock('@/lib/legal/route-factory', () => ({
  createLegalDocumentRoute: vi.fn(() => async () => {
    return new NextResponse('<h1>Privacy Policy</h1><p>Test content</p>', {
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  }),
}));

// Static import - mocks are already set up above
import { GET } from '@/app/api/legal/privacy/route';

describe('GET /api/legal/privacy', () => {
  it('returns privacy policy content', async () => {
    const response = await GET();
    const contentType = response.headers.get('Content-Type');

    expect(response.status).toBe(200);
    expect(contentType).toBe('text/html');

    const html = await response.text();
    expect(html).toContain('Privacy Policy');
  });
});
