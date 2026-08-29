import { describe, expect, it } from 'vitest';
import { GET as getCanonical } from '@/app/api/v1/openapi.json/route';
import { GET as getDiscovery } from '@/app/openapi.json/route';
import {
  ARTIST_OPENAPI_CACHE_CONTROL,
  ARTIST_OPENAPI_DOCUMENT,
} from '@/lib/api/v1/openapi';

async function readOpenApiResponse(response: Response) {
  const body: unknown = await response.json();
  return {
    body,
    contentType: response.headers.get('content-type') ?? '',
    cacheControl: response.headers.get('Cache-Control'),
    corsOrigin: response.headers.get('Access-Control-Allow-Origin'),
    status: response.status,
  };
}

function collectOperations(document: typeof ARTIST_OPENAPI_DOCUMENT) {
  return Object.values(document.paths).map(pathItem => pathItem.get);
}

describe('public artist OpenAPI contract', () => {
  it('is OpenAPI 3.1 with unique operation IDs and JSON response schemas', () => {
    expect(ARTIST_OPENAPI_DOCUMENT.openapi).toBe('3.1.0');

    const operations = collectOperations(ARTIST_OPENAPI_DOCUMENT);
    const operationIds = operations.map(operation => operation.operationId);

    expect(operationIds.length).toBeGreaterThan(0);
    expect(new Set(operationIds).size).toBe(operationIds.length);

    for (const operation of operations) {
      const responses = Object.values(operation.responses);
      expect(responses.length).toBeGreaterThan(0);
      for (const response of responses) {
        const schema = response.content['application/json'].schema;
        expect(schema.$ref ?? schema.type).toBeTruthy();
      }
    }
  });

  it('exposes only public GET operations', () => {
    const pathItems = Object.values(ARTIST_OPENAPI_DOCUMENT.paths);
    expect(pathItems.length).toBeGreaterThan(0);
    for (const pathItem of pathItems) {
      expect(Object.keys(pathItem)).toEqual(['get']);
    }
  });
});

describe('OpenAPI discovery routes', () => {
  it.each([
    ['/api/v1/openapi.json', getCanonical],
    ['/openapi.json', getDiscovery],
  ] as const)('%s returns 200 JSON with CORS and cache headers', async (_path, handler) => {
    const { body, cacheControl, contentType, corsOrigin, status } =
      await readOpenApiResponse(handler());

    expect(status).toBe(200);
    expect(contentType).toContain('application/json');
    expect(corsOrigin).toBe('*');
    expect(cacheControl).toBe(ARTIST_OPENAPI_CACHE_CONTROL);
    expect(body).toEqual(ARTIST_OPENAPI_DOCUMENT);
  });

  it('root discovery surface equals the canonical contract', async () => {
    const [canonical, discovery] = await Promise.all([
      readOpenApiResponse(getCanonical()),
      readOpenApiResponse(getDiscovery()),
    ]);

    expect(discovery.status).toBe(canonical.status);
    expect(discovery.body).toEqual(canonical.body);
    expect(discovery.contentType).toBe(canonical.contentType);
    expect(discovery.cacheControl).toBe(canonical.cacheControl);
    expect(discovery.corsOrigin).toBe(canonical.corsOrigin);
  });
});
