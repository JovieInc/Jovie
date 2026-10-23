import { ARTIST_OPENAPI_DOCUMENT } from '@/lib/api/v1/openapi';

/**
 * Renders the canonical public OpenAPI document
 * (served at /api/v1/openapi.json and /openapi.json) as deterministic JSON.
 * Used by the oasdiff breaking-change guard to diff the PR head against the
 * merge base.
 */
process.stdout.write(`${JSON.stringify(ARTIST_OPENAPI_DOCUMENT, null, 2)}\n`);
