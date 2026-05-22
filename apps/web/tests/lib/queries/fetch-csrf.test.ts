/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithTimeoutResponse } from '@/lib/queries/fetch';
import { CSRF_HEADER_NAME } from '@/lib/security/csrf';

describe('fetchWithTimeoutResponse CSRF header injection', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
    document.cookie = 'jovie_csrf=';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('attaches the CSRF token to same-origin mutating API requests', async () => {
    document.cookie = 'jovie_csrf=session-token-123';
    mockFetch.mockResolvedValueOnce(
      new Response('{"ok":true}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    await fetchWithTimeoutResponse('/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, options] = mockFetch.mock.calls[0] as [
      string,
      RequestInit & { headers?: HeadersInit },
    ];
    const headers = new Headers(options.headers);

    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get(CSRF_HEADER_NAME)).toBe('session-token-123');
  });

  it('does not attach the CSRF token to safe requests', async () => {
    document.cookie = 'jovie_csrf=session-token-123';
    mockFetch.mockResolvedValueOnce(
      new Response('{"ok":true}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    await fetchWithTimeoutResponse('/api/stripe/checkout');

    const [, options] = mockFetch.mock.calls[0] as [
      string,
      RequestInit & { headers?: HeadersInit },
    ];
    const headers = new Headers(options.headers);

    expect(headers.get(CSRF_HEADER_NAME)).toBeNull();
  });

  it('preserves an explicitly provided CSRF header', async () => {
    document.cookie = 'jovie_csrf=session-token-123';
    mockFetch.mockResolvedValueOnce(
      new Response('{"ok":true}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    await fetchWithTimeoutResponse('/api/stripe/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [CSRF_HEADER_NAME]: 'explicit-token',
      },
    });

    const [, options] = mockFetch.mock.calls[0] as [
      string,
      RequestInit & { headers?: HeadersInit },
    ];
    const headers = new Headers(options.headers);

    expect(headers.get(CSRF_HEADER_NAME)).toBe('explicit-token');
  });
});
