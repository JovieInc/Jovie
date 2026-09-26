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
    expect(body).toContain('Contact: mailto:security@jov.ie');
    expect(body).toContain('Contact: mailto:abuse@jov.ie');
    expect(body).toContain('Contact: https://jov.ie/report');
    expect(body).toContain(
      'Canonical: https://jov.ie/.well-known/security.txt'
    );
    expect(body).toContain('Preferred-Languages: en');
  });

  it('has an Expires field set in the future', async () => {
    const res = GET();
    const body = await res.text();

    const match = body.match(/^Expires: (.+)$/m);
    expect(match).not.toBeNull();
    const expires = new Date(match?.[1] ?? '');
    expect(expires.getTime()).toBeGreaterThan(Date.now());
  });
});
