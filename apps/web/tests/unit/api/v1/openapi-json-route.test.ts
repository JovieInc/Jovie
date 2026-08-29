import { describe, expect, it } from 'vitest';
import { GET as getCanonical } from '@/app/api/v1/openapi.json/route';
import { GET as getCompatibility } from '@/app/openapi.json/route';

describe('public OpenAPI surfaces', () => {
  it('publishes the same OpenAPI 3.1 document at /openapi.json and /api/v1/openapi.json', async () => {
    const [canonical, compatibility] = await Promise.all([
      getCanonical(),
      getCompatibility(),
    ]);

    expect(canonical.status).toBe(200);
    expect(compatibility.status).toBe(200);
    expect(canonical.headers.get('content-type')).toContain('application/json');
    expect(compatibility.headers.get('content-type')).toContain(
      'application/json'
    );

    const canonicalBody = await canonical.json();
    const compatibilityBody = await compatibility.json();

    expect(compatibilityBody).toEqual(canonicalBody);
    expect(canonicalBody.openapi).toBe('3.1.0');
    expect(canonicalBody.paths['/{username}'].get.operationId).toBe(
      'getArtist'
    );
    expect(canonicalBody.paths['/{username}'].get.description).toContain(
      'read-only'
    );
  });
});
