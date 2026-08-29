import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const API_REFERENCE_RELATIVE_PATH = 'apps/docs/app/docs/api-reference/page.mdx';
const API_REFERENCE_PATH = [
  resolve(process.cwd(), API_REFERENCE_RELATIVE_PATH),
  resolve(process.cwd(), '..', '..', API_REFERENCE_RELATIVE_PATH),
  resolve(process.cwd(), '..', API_REFERENCE_RELATIVE_PATH),
].find(existsSync);

if (!API_REFERENCE_PATH) {
  throw new Error(`Unable to locate ${API_REFERENCE_RELATIVE_PATH}`);
}

const apiReference = readFileSync(API_REFERENCE_PATH, 'utf8');

describe('docs API reference contract', () => {
  it('documents the live anonymous read-only API origin and discovery surfaces', () => {
    expect(apiReference).toContain('GET https://jov.ie/api/v1');
    expect(apiReference).toContain('GET https://jov.ie/api/v1/{username}');
    expect(apiReference).toContain('https://jov.ie/api/v1/openapi.json');
    expect(apiReference).toContain('https://jov.ie/openapi.json');
    expect(apiReference).toContain('No API key, OAuth token');
  });

  it('does not reintroduce invented authentication, base, or write claims', () => {
    expect(apiReference).not.toContain('api.jov.ie');
    expect(apiReference).not.toContain('All endpoints require authentication');
    expect(apiReference).not.toContain('Authorization: Bearer');
    expect(apiReference).not.toContain('Planned sections');
    expect(apiReference).not.toContain('Read and update artist profile');
    expect(apiReference).not.toContain('Manage releases');
  });
});
