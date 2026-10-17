import { expect } from 'vitest';
import { z } from 'zod';
import { ARTIST_OPENAPI_DOCUMENT, type JsonSchema } from '@/lib/api/v1/openapi';

export function publicOpenApiValidator(schema: JsonSchema) {
  const document = JSON.stringify({
    ...schema,
    $defs: ARTIST_OPENAPI_DOCUMENT.components.schemas,
  }).replaceAll('#/components/schemas/', '#/$defs/');
  return z.fromJSONSchema(JSON.parse(document));
}

/** Validate actual route output, including error codes, against the published schema. */
export async function expectPublicOpenApiResponse(
  path: string,
  method: 'get' | 'post',
  response: Response
) {
  const operation = ARTIST_OPENAPI_DOCUMENT.paths[path][method]!;
  const documented =
    operation.responses[String(response.status)] ?? operation.responses.default;
  expect(
    documented,
    `${method} ${path}: undocumented HTTP ${response.status}`
  ).toBeDefined();
  const schema = documented.content['application/json'].schema;
  const body: unknown = await response.clone().json();
  expect(publicOpenApiValidator(schema).safeParse(body)).toMatchObject({
    success: true,
  });
  return response;
}
