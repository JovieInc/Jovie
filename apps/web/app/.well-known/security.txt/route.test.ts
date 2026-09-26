import { describe, expect, it, vi } from 'vitest';

vi.mock('@/constants/app', () => ({
  BASE_URL: 'https://jov.ie',
}));

vi.mock('@/constants/domains', () => ({
  ABUSE_EMAIL: 'abuse@jov.ie',
  SECURITY_EMAIL: 'security@jov.ie',
}));

const { GET } = await import('./route');

describe('GET /.well-known/security.txt', () => {
  it('returns a valid RFC 9116 security.txt with monitored contacts', async () => {
    const res = GET();
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/plain');
    for (const line of [
      'Contact: mailto:security@jov.ie',
      'Contact: mailto:abuse@jov.ie',
      'Contact: https://jov.ie/report',
      'Canonical: https://jov.ie/.well-known/security.txt',
      'Preferred-Languages: en',
    ]) {
      expect(body).toContain(line);
    }

    const expires = new Date(body.match(/^Expires: (.+)$/m)?.[1] ?? '');
    expect(expires.getTime()).toBeGreaterThan(Date.now());
  });
});
