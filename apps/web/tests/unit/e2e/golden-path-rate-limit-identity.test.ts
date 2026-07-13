import { isIP } from 'node:net';
import { describe, expect, it } from 'vitest';
import { createGoldenPathTestIp } from '@/tests/e2e/utils/golden-path-rate-limit-identity';

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
});
