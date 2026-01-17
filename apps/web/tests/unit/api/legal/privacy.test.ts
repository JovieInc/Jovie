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

vi.mock('fs', () => ({
  default: {
    readFileSync: vi.fn().mockReturnValue('# Privacy Policy\n\nTest content'),
  },
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
