import { describe, expect, it, vi } from 'vitest';

vi.mock('@/constants/app', () => ({ BASE_URL: 'https://jov.ie' }));

const [{ GET: getCanonical }, { GET: getVersioned }] = await Promise.all([
  import('./route'),
  import('@/app/api/v1/openapi.json/route'),
]);

describe('GET /openapi.json', () => {
  it('serves the same public Artist API spec as /api/v1/openapi.json', async () => {
    const canonical = getCanonical();
    const versioned = getVersioned();

    expect(canonical.status).toBe(200);
    expect(versioned.status).toBe(200);
    expect(canonical.headers.get('Content-Type')).toContain('application/json');

    const canonicalSpec = await canonical.json();
    const versionedSpec = await versioned.json();

    expect(canonicalSpec).toEqual(versionedSpec);
    expect(canonicalSpec.openapi).toBe('3.1.0');
    expect(canonicalSpec.info.title).toBe('Jovie Artist API');
    expect(canonicalSpec.paths['/{username}'].get.operationId).toBe(
      'getArtist'
    );
    expect(canonicalSpec.info.description).toMatch(/read-only/i);
    expect(canonicalSpec.info.contact.url).toBe('https://jov.ie/llms.txt');
  });
});
