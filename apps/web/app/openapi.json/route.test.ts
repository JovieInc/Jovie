import { describe, expect, it } from 'vitest';
import { GET as canonicalGET } from '@/app/api/v1/openapi.json/route';
import { GET as aliasGET } from '@/app/openapi.json/route';

describe('GET /openapi.json', () => {
  it('re-exports the public Artist API spec', async () => {
    const [alias, canonical] = await Promise.all([aliasGET(), canonicalGET()]);
    expect(alias.status).toBe(200);
    expect(canonical.status).toBe(200);
    expect(await alias.json()).toEqual(await canonical.json());
  });
});
