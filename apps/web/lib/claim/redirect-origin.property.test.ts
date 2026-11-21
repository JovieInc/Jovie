/**
 * Property tests for claim redirect origin selection.
 *
 * Mutation score on lib/claim/redirect-origin.ts was 47.1% with example-only
 * coverage. These invariants must hold for every Host the browser can send —
 * especially spoofed public hosts — so a mutated allow-list or parser fails.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildClaimRedirectUrl } from './redirect-origin';

function requestOf(url: string, host: string | null): {
  readonly url: string;
  readonly headers: Headers;
} {
  const headers = new Headers();
  if (host !== null) headers.set('host', host);
  return { url, headers };
}

const LOOPBACK_HOSTS = [
  'localhost',
  'localhost:0',
  'localhost:3100',
  'localhost:65535',
  '127.0.0.1',
  '127.0.0.1:3100',
  '127.255.255.255:9',
  '[::1]',
  '[::1]:0',
  '[::1]:3100',
  '[::1]:65535',
] as const;

const REJECTED_HOSTS = [
  '',
  '   ',
  'evil.example',
  '127.0.0.1.evil.example',
  'localhost.evil',
  'jov.ie',
  '127.0.0.1/path',
  '127.0.0.1?x=1',
  '127.0.0.1#frag',
  '127.0.0.1\\x',
  'user@127.0.0.1',
  '127.0.0.1:abc',
  '127.0.0.1:x1',
  '127.0.0.1:99999',
  '127.0.0.1:65536',
  '[::1',
  '[::1]x',
  '::1',
  '256.0.0.1',
  '127.0.0',
  'a'.repeat(256),
] as const;

describe('buildClaimRedirectUrl properties', () => {
  it('honors loopback Host for the redirect origin (cookie host-only)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...LOOPBACK_HOSTS),
        fc.constantFrom('http://localhost/claim/t', 'https://localhost/claim/t'),
        fc.constantFrom('/e2eclaimartist?claim=1', '/signin', '/'),
        (host, requestUrl, pathname) => {
          const result = buildClaimRedirectUrl(
            requestOf(requestUrl, host),
            pathname
          );
          const expectedProtocol = requestUrl.startsWith('https:')
            ? 'https:'
            : 'http:';
          expect(result.origin).toBe(`${expectedProtocol}//${host}`);
          expect(`${result.pathname}${result.search}`).toBe(
            new URL(pathname, 'http://example.test').pathname +
              new URL(pathname, 'http://example.test').search
          );
        }
      ),
      { numRuns: 80 }
    );
  });

  it('ignores non-loopback / malformed Host and keeps request.url origin', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...REJECTED_HOSTS),
        fc.constantFrom(
          'http://localhost:3100/claim/t',
          'https://localhost/claim/t',
          'http://127.0.0.1:3100/claim/t'
        ),
        fc.constantFrom('/app', '/onboarding/checkout', '/'),
        (host, requestUrl, pathname) => {
          const result = buildClaimRedirectUrl(
            requestOf(requestUrl, host),
            pathname
          );
          const fallback = new URL(pathname, requestUrl);
          expect(result.origin).toBe(fallback.origin);
          expect(result.toString()).toBe(fallback.toString());
        }
      ),
      { numRuns: 100 }
    );
  });

  it('null Host falls back to request.url (same as missing header)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          'http://localhost/claim/t',
          'https://127.0.0.1:3100/claim/t'
        ),
        fc.constantFrom('/x', '/y?z=1'),
        (requestUrl, pathname) => {
          const result = buildClaimRedirectUrl(
            requestOf(requestUrl, null),
            pathname
          );
          expect(result.toString()).toBe(
            new URL(pathname, requestUrl).toString()
          );
        }
      ),
      { numRuns: 40 }
    );
  });

  it('never upgrades http→https from Host alone', () => {
    fc.assert(
      fc.property(fc.constantFrom(...LOOPBACK_HOSTS), host => {
        const result = buildClaimRedirectUrl(
          requestOf('http://localhost/claim/t', host),
          '/'
        );
        expect(result.protocol).toBe('http:');
      }),
      { numRuns: 40 }
    );
  });

  it('spoofed public Host cannot move redirect off request.url origin', () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 40 })
          .filter(
            s =>
              !/^(?:localhost|127(?:\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)){3}|::1)$/i.test(
                s.split(':')[0] ?? ''
              ) && !/[\s/?#\\@]/.test(s)
          ),
        spoofed => {
          const requestUrl = 'http://localhost:3100/claim/t';
          const result = buildClaimRedirectUrl(
            requestOf(requestUrl, spoofed),
            '/protected'
          );
          expect(result.origin).toBe('http://localhost:3100');
        }
      ),
      { numRuns: 80 }
    );
  });
});
