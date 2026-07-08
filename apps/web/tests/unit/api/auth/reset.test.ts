import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

const { POST, GET } = await import('@/app/api/auth/reset/route');

function buildRequest(
  url: string,
  cookieHeader: string | null = null
): NextRequest {
  const headers = new Headers();
  if (cookieHeader) headers.set('cookie', cookieHeader);
  return new NextRequest(url, { method: 'POST', headers });
}

describe('POST /api/auth/reset', () => {
  it('303 redirects to /signin?reset=1', async () => {
    const res = await POST(
      buildRequest('https://staging.jov.ie/api/auth/reset')
    );
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(
      'https://staging.jov.ie/signin?reset=1'
    );
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('deletes Better Auth cookies on both host and parent scope for subdomain hosts', async () => {
    const res = await POST(
      buildRequest(
        'https://staging.jov.ie/api/auth/reset',
        '__Secure-better-auth.session_token=stale; jv_country=US'
      )
    );
    const setCookies = res.headers.getSetCookie();

    const sessionCookies = setCookies.filter(c =>
      c.startsWith('__Secure-better-auth.session_token=')
    );
    expect(sessionCookies.length).toBe(2);
    expect(
      sessionCookies.some(c => c.toLowerCase().includes('domain=.jov.ie'))
    ).toBe(true);
    expect(sessionCookies.every(c => c.includes('Expires='))).toBe(true);

    // Non-auth cookies are untouched
    expect(setCookies.some(c => c.startsWith('jv_country='))).toBe(false);
  });

  it('deletes only on host scope for apex hosts', async () => {
    const res = await POST(
      buildRequest(
        'https://jov.ie/api/auth/reset',
        'better-auth.session_token=stale'
      )
    );
    const setCookies = res.headers.getSetCookie();
    const sessionCookies = setCookies.filter(c =>
      c.startsWith('better-auth.session_token=')
    );
    // Apex has only 2 parts so no parent scope delete
    expect(sessionCookies.length).toBe(1);
  });

  it('is idempotent when no clerk cookies are present', async () => {
    const res = await POST(
      buildRequest('https://staging.jov.ie/api/auth/reset')
    );
    expect(res.status).toBe(303);
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it('supports GET so timeout-escape link works as a plain hyperlink', async () => {
    const res = await GET(
      buildRequest('https://staging.jov.ie/api/auth/reset', '__session=stale')
    );
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(
      'https://staging.jov.ie/signin?reset=1'
    );
  });
});
