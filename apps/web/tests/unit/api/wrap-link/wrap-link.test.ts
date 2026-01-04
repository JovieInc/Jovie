import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCreateWrappedLink = vi.hoisted(() => vi.fn());
const mockIsValidUrl = vi.hoisted(() => vi.fn());

vi.mock('@/lib/services/link-wrapping', () => ({
  createWrappedLink: mockCreateWrappedLink,
}));

vi.mock('@/lib/utils/url-encryption', () => ({
  isValidUrl: mockIsValidUrl,
}));

vi.mock('@/lib/utils/bot-detection', () => ({
  detectBot: vi.fn().mockReturnValue({ isBot: false }),
  checkRateLimit: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn().mockResolvedValue(undefined),
}));

describe('POST /api/wrap-link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns 400 for invalid URL', async () => {
    mockIsValidUrl.mockReturnValue(false);

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
    mockIsValidUrl.mockReturnValue(true);
    mockCreateWrappedLink.mockResolvedValue({
      shortId: 'abc123',
      kind: 'wrapped',
      domain: 'jov.ie',
      category: 'external',
      titleAlias: null,
      createdAt: new Date().toISOString(),
      expiresAt: null,
    });

    const { POST } = await import('@/app/api/wrap-link/route');
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
    expect(data.normalUrl).toBe('/go/abc123');
    expect(data.sensitiveUrl).toBe('/out/abc123');
  });
});
