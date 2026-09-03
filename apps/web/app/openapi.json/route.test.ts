import { describe, expect, it, vi } from 'vitest';
import { PUBLIC_ARTIST_API_POLICY_LINK } from '@/lib/api/v1/contract';

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
    expect(canonical.headers.get('Link')).toBe(PUBLIC_ARTIST_API_POLICY_LINK);
    expect(versioned.headers.get('Link')).toBe(PUBLIC_ARTIST_API_POLICY_LINK);

    const canonicalSpec = await canonical.json();
    const versionedSpec = await versioned.json();

    expect(canonicalSpec).toEqual(versionedSpec);
    expect(canonicalSpec.openapi).toBe('3.1.0');
    expect(canonicalSpec.info.title).toBe('Jovie Artist API');
    expect(canonicalSpec.paths['/api/v1'].get.operationId).toBe(
      'getArtistApiIndex'
    );
    expect(canonicalSpec.paths['/api/v1/{username}'].get.operationId).toBe(
      'getArtist'
    );
    expect(canonicalSpec.info.description).toMatch(/read-only/i);
    expect(canonicalSpec.info.contact.url).toBe('https://jov.ie/llms.txt');
  });
});
