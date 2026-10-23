import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ARTIST_OPENAPI_DOCUMENT } from '@/lib/api/v1/openapi';

/**
 * Renders the canonical public OpenAPI document
 * (served at /api/v1/openapi.json and /openapi.json) as deterministic JSON.
 * Used by the oasdiff breaking-change guard to diff the PR head against the
 * merge base.
 */
export function renderPublicOpenApiDocument(): string {
  return `${JSON.stringify(ARTIST_OPENAPI_DOCUMENT, null, 2)}\n`;
}

const invokedAsScript =
  process.argv[1] !== undefined &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (invokedAsScript) {
  process.stdout.write(renderPublicOpenApiDocument());
}
