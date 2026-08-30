import { describe, expect, it } from 'vitest';
import { GET as getCanonical } from '@/app/api/v1/openapi.json/route';
import { GET as getDiscovery } from '@/app/openapi.json/route';
import { PUBLIC_ARTIST_API_POLICY_LINK } from '@/lib/api/v1/contract';
import {
  API_VERSIONING_POLICY,
  ARTIST_OPENAPI_CACHE_CONTROL,
  ARTIST_OPENAPI_DOCUMENT,
  type ArtistOpenApiDocument,
} from '@/lib/api/v1/openapi';

async function readOpenApiResponse(response: Response) {
  const body: unknown = await response.json();
  return {
    body,
    contentType: response.headers.get('content-type') ?? '',
    cacheControl: response.headers.get('Cache-Control'),
    corsOrigin: response.headers.get('Access-Control-Allow-Origin'),
    link: response.headers.get('Link'),
    status: response.status,
  };
}

function collectOperations(document: typeof ARTIST_OPENAPI_DOCUMENT) {
  return Object.values(document.paths).map(pathItem => pathItem.get);
}

type ArtistOperation = ArtistOpenApiDocument['paths'][string]['get'];

function resolvesToObjectSchema(
  document: ArtistOpenApiDocument,
  schema: { readonly $ref?: string; readonly type?: string }
) {
  if (schema.type === 'object') return true;

  const schemaName = schema.$ref?.split('/').at(-1);
  return schemaName
    ? document.components.schemas[schemaName]?.type === 'object'
    : false;
}

function isFunctionCallable(
  document: ArtistOpenApiDocument,
  operation: ArtistOperation
) {
  const hasTypedRequest = operation.parameters?.some(parameter =>
    Boolean(parameter.schema.type || parameter.schema.$ref)
  );
  const successSchema =
    operation.responses['200']?.content['application/json']?.schema;

  return Boolean(
    operation.operationId &&
      (operation.description || operation.summary) &&
      hasTypedRequest &&
      successSchema &&
      resolvesToObjectSchema(document, successSchema)
  );
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

  it('gives every function-callable operation a typed input and object output', () => {
    const operations = collectOperations(ARTIST_OPENAPI_DOCUMENT);

    expect(
      operations.every(operation =>
        isFunctionCallable(ARTIST_OPENAPI_DOCUMENT, operation)
      )
    ).toBe(true);
    expect(ARTIST_OPENAPI_DOCUMENT.paths['/api/v1'].get.parameters).toEqual([
      expect.objectContaining({
        name: 'Accept',
        in: 'header',
        required: false,
        schema: { type: 'string', enum: ['application/json'] },
      }),
    ]);
  });

  it('deliberately rejects a function operation with no typed request input', () => {
    const indexOperation = ARTIST_OPENAPI_DOCUMENT.paths['/api/v1'].get;
    const missingInputOperation: ArtistOperation = {
      ...indexOperation,
      parameters: [],
    };

    expect(
      isFunctionCallable(ARTIST_OPENAPI_DOCUMENT, missingInputOperation)
    ).toBe(false);
  });

  it('publishes a machine-readable version policy without deprecating active v1', () => {
    expect(ARTIST_OPENAPI_DOCUMENT['x-jovie-versioning']).toEqual(
      API_VERSIONING_POLICY
    );
    expect(API_VERSIONING_POLICY).toMatchObject({
      strategy: 'url',
      activeVersion: 'v1',
      additiveChanges: 'remain-within-active-version',
      breakingChanges: 'publish-a-new-url-version',
      lifecycle: {
        deprecation: {
          header: 'Deprecation',
          standard: 'RFC 9745',
          active: false,
        },
        sunset: {
          header: 'Sunset',
          standard: 'RFC 8594',
          active: false,
        },
      },
    });

    for (const operation of collectOperations(ARTIST_OPENAPI_DOCUMENT)) {
      for (const response of Object.values(operation.responses)) {
        expect(response.headers?.Deprecation).toBeUndefined();
        expect(response.headers?.Sunset).toBeUndefined();
      }
    }
  });

  it('describes the live versioned paths, generic handle discovery, and index schema', () => {
    expect(ARTIST_OPENAPI_DOCUMENT.servers).toEqual([
      { url: 'https://jov.ie', description: 'Production API origin' },
    ]);
    expect(ARTIST_OPENAPI_DOCUMENT.externalDocs.url).toBe(
      'https://docs.jov.ie/docs/api-reference'
    );
    expect(ARTIST_OPENAPI_DOCUMENT.externalDocs.description).toContain(
      'lifecycle policy'
    );
    expect(ARTIST_OPENAPI_DOCUMENT.paths).toHaveProperty('/api/v1');
    expect(ARTIST_OPENAPI_DOCUMENT.paths).toHaveProperty('/api/v1/{username}');
    expect(ARTIST_OPENAPI_DOCUMENT.paths).not.toHaveProperty('/{username}');

    const indexOperation = ARTIST_OPENAPI_DOCUMENT.paths['/api/v1'].get;
    expect(indexOperation.operationId).toBe('getArtistApiIndex');

    const profileOperation =
      ARTIST_OPENAPI_DOCUMENT.paths['/api/v1/{username}'].get;
    expect(profileOperation.parameters?.[0]?.schema.examples).toEqual([
      'public-handle',
    ]);
    expect(indexOperation.responses['200']).toBeDefined();
    expect(
      ARTIST_OPENAPI_DOCUMENT.paths['/api/v1'].get.responses['200'].content[
        'application/json'
      ].schema.$ref
    ).toBe('#/components/schemas/ArtistApiIndex');
    expect(
      ARTIST_OPENAPI_DOCUMENT.components.schemas.ArtistApiIndex.properties
        ?.endpoints?.properties?.artistTemplate?.format
    ).toBe('uri-template');
    expect(
      ARTIST_OPENAPI_DOCUMENT.components.schemas.ArtistApiIndex.properties
        ?.rateLimit?.properties?.appliesTo
    ).toEqual({ type: 'string', enum: ['artist-profile'] });
    expect(
      ARTIST_OPENAPI_DOCUMENT.components.schemas.ArtistApiIndex.properties
        ?._links?.properties?.policy?.format
    ).toBe('uri');
    expect(profileOperation.description).not.toContain('timwhite');
    expect(Object.keys(profileOperation.responses)).toEqual([
      '200',
      '404',
      '429',
      '503',
    ]);
    expect(profileOperation.responses['200'].headers).toEqual(
      expect.objectContaining({
        Link: expect.any(Object),
        'RateLimit-Policy': expect.any(Object),
        RateLimit: expect.any(Object),
        'X-RateLimit-Remaining': expect.any(Object),
      })
    );
    expect(profileOperation.responses['429'].headers).toEqual(
      expect.objectContaining({ 'Retry-After': expect.any(Object) })
    );
    expect(profileOperation.responses['503'].headers).toEqual(
      expect.objectContaining({ 'Retry-After': expect.any(Object) })
    );

    const indexSchema =
      ARTIST_OPENAPI_DOCUMENT.components.schemas.ArtistApiIndex;
    expect(indexSchema.properties).toHaveProperty('rateLimit');
  });
});

describe('OpenAPI discovery routes', () => {
  it.each([
    ['/api/v1/openapi.json', getCanonical],
    ['/openapi.json', getDiscovery],
  ] as const)('%s returns 200 JSON with CORS and cache headers', async (_path, handler) => {
    const { body, cacheControl, contentType, corsOrigin, link, status } =
      await readOpenApiResponse(handler());

    expect(status).toBe(200);
    expect(contentType).toContain('application/json');
    expect(corsOrigin).toBe('*');
    expect(link).toBe(PUBLIC_ARTIST_API_POLICY_LINK);
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
    expect(discovery.link).toBe(canonical.link);
  });
});
