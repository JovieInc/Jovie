import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { buildClaimRedirectUrl } from './redirect-origin';

describe('buildClaimRedirectUrl', () => {
  it('keeps a 127.0.0.1 browser host when NextURL rewrites request.url to localhost', () => {
    const request = new NextRequest(
      'http://127.0.0.1:3100/claim/fixture-token',
      { headers: { host: '127.0.0.1:3100' } }
    );

    expect(request.url.startsWith('http://localhost:3100/')).toBe(true);
    expect(request.headers.get('host')).toBe('127.0.0.1:3100');
    expect(
      buildClaimRedirectUrl(request, '/e2eclaimartist?claim=1').toString()
    ).toBe('http://127.0.0.1:3100/e2eclaimartist?claim=1');
  });

  it('keeps localhost locations for requests that already use localhost', () => {
    const request = new NextRequest('http://localhost/claim/fixture-token');

    expect(
      buildClaimRedirectUrl(request, '/e2eclaimartist?claim=1').toString()
    ).toBe('http://localhost/e2eclaimartist?claim=1');
  });

  it('ignores a non-loopback Host and uses request.url', () => {
    const request = new NextRequest('http://localhost/claim/fixture-token', {
      headers: { host: 'evil.example' },
    });

    expect(buildClaimRedirectUrl(request, '/').toString()).toBe(
      'http://localhost/'
    );
  });

  it('ignores a loopback lookalike host', () => {
    const request = new NextRequest('http://localhost/claim/fixture-token', {
      headers: { host: '127.0.0.1.evil.example' },
    });

    expect(buildClaimRedirectUrl(request, '/').toString()).toBe(
      'http://localhost/'
    );
  });
});
