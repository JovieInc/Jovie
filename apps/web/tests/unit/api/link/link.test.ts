import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetWrappedLink = vi.hoisted(() => vi.fn());
const mockDetectBot = vi.hoisted(() => vi.fn());
const mockDbInsert = vi.hoisted(() => vi.fn());

vi.mock('@/lib/services/link-wrapping', () => ({
  getWrappedLink: mockGetWrappedLink,
  incrementClickCount: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/utils/bot-detection', () => ({
  detectBot: mockDetectBot,
  checkRateLimit: vi.fn().mockResolvedValue(false),
  createBotResponse: vi.fn(),
  logBotDetection: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/db', () => ({
  db: {
    insert: mockDbInsert,
  },
}));

vi.mock('@/lib/db/schema', () => ({
  signedLinkAccess: {},
}));

vi.mock('@/lib/utils/url-encryption.server', () => ({
  generateSignedToken: vi.fn().mockReturnValue('test-token-123'),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  apiLimiter: {
    limit: vi.fn().mockResolvedValue({
      success: true,
      limit: 100,
      remaining: 100,
      reset: Math.floor(Date.now() / 1000) + 60,
    }),
  },
  createRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

describe('POST /api/link/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockDetectBot.mockReturnValue({
      isBot: false,
      isMeta: false,
      shouldBlock: false,
      userAgent: 'Mozilla/5.0 Test Browser',
      reason: null,
    });
    mockDbInsert.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('returns 400 for invalid request body', async () => {
    const { POST } = await import('@/app/api/link/[id]/route');
    const request = new NextRequest('http://localhost/api/link/test123', {
      method: 'POST',
      body: 'invalid json',
    });

    const response = await POST(request, {
      params: Promise.resolve({ id: 'test123' }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid request body');
  });

  it('returns 400 when verification is missing', async () => {
    const { POST } = await import('@/app/api/link/[id]/route');
    const request = new NextRequest('http://localhost/api/link/test123', {
      method: 'POST',
      body: JSON.stringify({ timestamp: Date.now() }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ id: 'test123' }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Verification required');
  });

  it('returns 404 when link not found', async () => {
    mockGetWrappedLink.mockResolvedValue(null);

    const { POST } = await import('@/app/api/link/[id]/route');
    const request = new NextRequest('http://localhost/api/link/nonexistent', {
      method: 'POST',
      body: JSON.stringify({ verified: true, timestamp: Date.now() }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ id: 'nonexistent' }),
    });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Link not found');
  });

  it('returns signed URL for valid request', async () => {
    mockGetWrappedLink.mockResolvedValue({
      id: 'link_123',
      originalUrl: 'https://example.com',
    });

    const { POST } = await import('@/app/api/link/[id]/route');
    const request = new NextRequest('http://localhost/api/link/test123', {
      method: 'POST',
      body: JSON.stringify({ verified: true, timestamp: Date.now() }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ id: 'test123' }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.url).toBe('https://example.com');
    expect(data.expiresAt).toBeDefined();
  });
});

describe('GET /api/link/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns 405 method not allowed', async () => {
    const { GET } = await import('@/app/api/link/[id]/route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(405);
    expect(data.error).toBe('Method not allowed');
  });
});
