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

  it('deletes clerk cookies on both host and parent scope for subdomain hosts', async () => {
    const res = await POST(
      buildRequest(
        'https://staging.jov.ie/api/auth/reset',
        '__session=stale; __client_uat=123; jv_country=US'
      )
    );
    const setCookies = res.headers.getSetCookie();

    const sessionCookies = setCookies.filter(c => c.startsWith('__session='));
    expect(sessionCookies.length).toBe(2);
    expect(
      sessionCookies.some(c => c.toLowerCase().includes('domain=.jov.ie'))
    ).toBe(true);
    expect(sessionCookies.every(c => c.includes('Expires='))).toBe(true);

    // Non-clerk cookies are untouched
    expect(setCookies.some(c => c.startsWith('jv_country='))).toBe(false);
  });

  it('deletes only on host scope for apex hosts', async () => {
    const res = await POST(
      buildRequest('https://jov.ie/api/auth/reset', '__session=stale')
    );
    const setCookies = res.headers.getSetCookie();
    const sessionCookies = setCookies.filter(c => c.startsWith('__session='));
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
