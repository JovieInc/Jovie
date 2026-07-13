import { isIP } from 'node:net';
import { describe, expect, it } from 'vitest';
import {
  createGoldenPathPlaywrightTestIp,
  createGoldenPathTestIp,
  withGoldenPathTestIpHeaders,
} from '@/tests/e2e/utils/golden-path-rate-limit-identity';

describe('createGoldenPathTestIp', () => {
  it('returns a deterministic valid TEST-NET IPv6 identity', () => {
    const ip = createGoldenPathTestIp('29241658703', 'golden-path:t123');

    expect(isIP(ip)).toBe(6);
    expect(ip.startsWith('2001:db8:')).toBe(true);
    expect(createGoldenPathTestIp('29241658703', 'golden-path:t123')).toBe(ip);
  });

  it('isolates different runs and test identities', () => {
    const baseline = createGoldenPathTestIp('100', 'golden-path:a');

    expect(createGoldenPathTestIp('101', 'golden-path:a')).not.toBe(baseline);
    expect(createGoldenPathTestIp('100', 'golden-path:b')).not.toBe(baseline);
  });

  it('isolates Playwright retries, tests, and workers deterministically', () => {
    const baseline = createGoldenPathPlaywrightTestIp(
      '100',
      'smoke:auth',
      'test-a',
      0,
      1
    );

    expect(
      createGoldenPathPlaywrightTestIp('100', 'smoke:auth', 'test-a', 0, 1)
    ).toBe(baseline);
    expect(
      createGoldenPathPlaywrightTestIp('100', 'smoke:auth', 'test-b', 0, 1)
    ).not.toBe(baseline);
    expect(
      createGoldenPathPlaywrightTestIp('100', 'smoke:auth', 'test-a', 1, 1)
    ).not.toBe(baseline);
    expect(
      createGoldenPathPlaywrightTestIp('100', 'smoke:auth', 'test-a', 0, 2)
    ).not.toBe(baseline);
  });

  it('overrides both client IP headers while preserving request headers', () => {
    const headers = withGoldenPathTestIpHeaders(
      {
        authorization: 'Bearer test',
        'x-forwarded-for': '2001:db8:static::1',
        'x-real-ip': '2001:db8:other::1',
      },
      '2001:db8:isolated::1'
    );

    expect(headers).toEqual({
      authorization: 'Bearer test',
      'x-forwarded-for': '2001:db8:isolated::1',
      'x-real-ip': '2001:db8:isolated::1',
    });
  });
});
