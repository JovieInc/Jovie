import { artistOpenApiGET } from '@/lib/api/v1/openapi';

/**
 * Conventional `/openapi.json` compatibility alias.
 * Body is the canonical `/api/v1/openapi.json` artist API contract.
 *
 * `dynamic` and `revalidate` must be declared locally. Next.js cannot
 * statically parse route segment config that is re-exported.
 */
export const revalidate = false;
export const dynamic = 'force-static';

/** Conventional root discovery surface. Same contract as `/api/v1/openapi.json`. */
export function GET() {
  return artistOpenApiGET();
}
