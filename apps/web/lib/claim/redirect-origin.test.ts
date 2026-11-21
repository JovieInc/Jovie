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

  it('honors [::1] Host and keeps request protocol', () => {
    const httpsRequest = {
      url: 'https://localhost/claim/fixture-token',
      headers: new Headers({ host: '[::1]:3100' }),
    };
    expect(buildClaimRedirectUrl(httpsRequest, '/signin').toString()).toBe(
      'https://[::1]:3100/signin'
    );

    const httpRequest = {
      url: 'http://localhost/claim/fixture-token',
      headers: new Headers({ host: '[::1]' }),
    };
    expect(buildClaimRedirectUrl(httpRequest, '/signin').toString()).toBe(
      'http://[::1]/signin'
    );
  });

  it('rejects empty, oversize, and port-invalid Host headers', () => {
    for (const host of [
      '',
      '   ',
      '127.0.0.1:abc',
      '127.0.0.1:99999',
      '[::1]:99999',
      'a'.repeat(256),
    ]) {
      const request = {
        url: 'http://localhost:3100/claim/fixture-token',
        headers: new Headers(host === '' ? {} : { host }),
      };
      expect(buildClaimRedirectUrl(request, '/x').origin).toBe(
        'http://localhost:3100'
      );
    }
  });
});
