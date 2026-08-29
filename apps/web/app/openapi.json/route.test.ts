import { describe, expect, it, vi } from 'vitest';

vi.mock('@/constants/app', () => ({ BASE_URL: 'https://jov.ie' }));

describe('GET /openapi.json', () => {
  it('matches the canonical API contract and response headers', async () => {
    const [{ GET: getCompatibility }, { GET: getCanonical }] =
      await Promise.all([
        import('./route'),
        import('../api/v1/openapi.json/route'),
      ]);

    const [compatibilityResponse, canonicalResponse] = await Promise.all([
      getCompatibility(),
      getCanonical(),
    ]);

    expect(compatibilityResponse.status).toBe(200);
    expect(compatibilityResponse.headers.get('Content-Type')).toContain(
      'application/json'
    );
    expect(
      compatibilityResponse.headers.get('Access-Control-Allow-Origin')
    ).toBe('*');
    expect(compatibilityResponse.headers.get('Cache-Control')).toBe(
      'public, max-age=86400'
    );

    expect(compatibilityResponse.status).toBe(canonicalResponse.status);
    for (const headerName of [
      'Content-Type',
      'Access-Control-Allow-Origin',
      'Cache-Control',
    ]) {
      expect(compatibilityResponse.headers.get(headerName)).toBe(
        canonicalResponse.headers.get(headerName)
      );
    }
    expect(await compatibilityResponse.json()).toEqual(
      await canonicalResponse.json()
    );
  });
});
