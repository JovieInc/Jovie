import { resolveBaseURL } from 'better-auth';
import { describe, expect, it } from 'vitest';
import { resolveOvieWebOrigin } from './ovie-web-origin';

const credentialOrigin = new URL('https://ovie.example.test');
credentialOrigin.username = 'user';
credentialOrigin.password = 'not-a-real-credential';

describe('Ovie private auth origin', () => {
  it.each([
    undefined,
    '',
  ])('does not add trust when unconfigured (%s)', value => {
    expect(
      resolveOvieWebOrigin(value, { VERCEL_ENV: 'production' })
    ).toBeUndefined();
  });

  it.each([
    'production',
    'preview',
    'development',
    undefined,
  ])('accepts a normalized exact HTTPS origin in %s', VERCEL_ENV => {
    const url = resolveOvieWebOrigin('https://OVIE.example.test:443/', {
      VERCEL_ENV,
    });
    expect(url?.origin).toBe('https://ovie.example.test');
    expect(url?.host).toBe('ovie.example.test');
  });

  it.each([
    'http://localhost:3200',
    'http://127.0.0.1:3200',
    'http://[::1]:3200',
  ])('permits local smoke server %s outside hosted deployments', value => {
    expect(resolveOvieWebOrigin(value, {})?.origin).toBe(value);
    expect(
      resolveOvieWebOrigin(value, { VERCEL_ENV: 'development' })?.origin
    ).toBe(value);
    for (const VERCEL_ENV of ['production', 'preview']) {
      expect(() => resolveOvieWebOrigin(value, { VERCEL_ENV })).toThrow(
        'OVIE_WEB_ORIGIN'
      );
    }
  });

  it.each([
    'https://localhost:3200',
    'http://ovie.example.test',
    'http://localhost.attacker.test:3200',
    credentialOrigin.href,
    'https://*.example.test',
    'https://%2a.example.test',
    'https://ovie.example.test/app',
    'https://ovie.example.test/a/..',
    'https://ovie.example.test?',
    'https://ovie.example.test#',
    'https://ovie.example.test?redirect=attacker',
    'https://ovie.example.test/#fragment',
    'https://ovie.example.test\\path',
    ' https://ovie.example.test',
    'https://ovie.example.test\n',
    'https://ovie.example.test:invalid',
    'https://[invalid]',
    'file://ovie.example.test',
    '//ovie.example.test',
  ])('rejects unsafe or non-origin configuration %s without echoing it', value => {
    expect(() =>
      resolveOvieWebOrigin(value, { VERCEL_ENV: 'production' })
    ).toThrow(
      'OVIE_WEB_ORIGIN must be an exact HTTPS origin or a development loopback origin'
    );
    try {
      resolveOvieWebOrigin(value, { VERCEL_ENV: 'production' });
    } catch (error) {
      expect((error as Error).message).not.toContain(value);
    }
  });

  it('keeps configured port authority exact in Better Auth host resolution', () => {
    const origin = resolveOvieWebOrigin('https://ovie.example.test:8443', {
      VERCEL_ENV: 'production',
    })!;
    const baseURL = { allowedHosts: [origin.host], protocol: 'https' as const };
    expect(
      resolveBaseURL(
        baseURL,
        '/api/auth',
        new Request(`${origin.origin}/sign-in`),
        false
      )
    ).toBe('https://ovie.example.test:8443/api/auth');
    for (const url of [
      'https://ovie.example.test',
      'https://other.example.test:8443',
    ]) {
      expect(() =>
        resolveBaseURL(baseURL, '/api/auth', new Request(url), false)
      ).toThrow(/not in the allowed hosts list/i);
    }
  });
});
