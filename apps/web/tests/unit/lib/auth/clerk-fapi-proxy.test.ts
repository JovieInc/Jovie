import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockResolveClerkKeys = vi.hoisted(() => vi.fn());
const mockDecodeFapiHostFromPublishableKey = vi.hoisted(() => vi.fn());
const mockCaptureError = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/staging-clerk-keys', () => ({
  resolveClerkKeys: mockResolveClerkKeys,
}));

vi.mock('@/lib/auth/decode-fapi-host', () => ({
  decodeFapiHostFromPublishableKey: mockDecodeFapiHostFromPublishableKey,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

function request(path: string, init: RequestInit = {}) {
  return new NextRequest(`https://staging.jov.ie${path}`, init);
}

describe('clerk-fapi-proxy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveClerkKeys.mockReturnValue({
      publishableKey: 'pk_live_test',
      secretKey: 'sk_live_test',
      status: 'ok',
    });
    mockDecodeFapiHostFromPublishableKey.mockReturnValue(
      'clerk.staging.jov.ie'
    );
    mockCaptureError.mockResolvedValue(undefined);
  });

  it('splits combined Set-Cookie headers without splitting Expires dates', async () => {
    const { splitSetCookieHeader } = await import(
      '@/lib/auth/clerk-fapi-proxy'
    );

    expect(
      splitSetCookieHeader(
        'a=1; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Path=/, b=2; Path=/; HttpOnly'
      )
    ).toEqual([
      'a=1; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Path=/',
      'b=2; Path=/; HttpOnly',
    ]);
    expect(splitSetCookieHeader(null)).toEqual([]);
    expect(splitSetCookieHeader('')).toEqual([]);
  });

  it('returns null for non-Clerk paths without touching keys or fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { handleClerkFapiProxy } = await import(
      '@/lib/auth/clerk-fapi-proxy'
    );

    await expect(handleClerkFapiProxy(request('/app'))).resolves.toBeNull();
    expect(mockResolveClerkKeys).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed when the active publishable key cannot produce a FAPI host', async () => {
    mockDecodeFapiHostFromPublishableKey.mockReturnValue(null);

    const { handleClerkFapiProxy } = await import(
      '@/lib/auth/clerk-fapi-proxy'
    );

    const response = await handleClerkFapiProxy(request('/__clerk/v1/client'));

    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toEqual({
      error: 'Clerk proxy unavailable: missing or invalid publishable key',
    });
  });

  it('forwards POST callbacks to the decoded FAPI host without host or content-length headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'content-encoding': 'gzip',
        },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const { handleClerkFapiProxy } = await import(
      '@/lib/auth/clerk-fapi-proxy'
    );

    const response = await handleClerkFapiProxy(
      request('/__clerk/v1/oauth_callback?state=abc', {
        method: 'POST',
        body: 'code=oauth-code',
        headers: {
          accept: 'application/json',
          authorization: 'Bearer token',
          cookie: '__session=abc',
          'content-type': 'application/x-www-form-urlencoded',
          referer: 'https://appleid.apple.com/',
          'user-agent': 'JovieTest/1.0',
        },
      })
    );

    expect(response?.status).toBe(200);
    expect(response?.headers.get('content-encoding')).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://clerk.staging.jov.ie/v1/oauth_callback?state=abc',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(ArrayBuffer),
        redirect: 'manual',
      })
    );
    const forwardedHeaders = fetchMock.mock.calls[0]?.[1].headers as Headers;
    expect(forwardedHeaders.get('origin')).toBe('https://clerk.staging.jov.ie');
    expect(forwardedHeaders.get('referer')).toBe('https://appleid.apple.com/');
    expect(forwardedHeaders.get('host')).toBeNull();
    expect(forwardedHeaders.get('content-length')).toBeNull();
  });

  it('captures fetch failures and returns a bounded 502 response', async () => {
    const fetchError = new TypeError('fetch failed');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(fetchError));

    const { handleClerkFapiProxy } = await import(
      '@/lib/auth/clerk-fapi-proxy'
    );

    const response = await handleClerkFapiProxy(request('/clerk/v1/client'));

    expect(response?.status).toBe(502);
    await expect(response?.json()).resolves.toEqual({
      error: 'Clerk proxy error',
      code: 'TypeError',
      hint: 'fetch failed',
    });
    expect(mockCaptureError).toHaveBeenCalledWith(
      '[clerk-proxy] fetch failed',
      fetchError,
      expect.objectContaining({
        pathname: '/clerk/v1/client',
        hostname: 'staging.jov.ie',
        context: 'clerk_proxy_fetch',
        method: 'GET',
      })
    );
  });
});
