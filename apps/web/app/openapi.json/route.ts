import { GET as getCanonicalArtistOpenApi } from '@/app/api/v1/openapi.json/route';

/**
 * Conventional `/openapi.json` compatibility alias.
 * Body is the canonical `/api/v1/openapi.json` artist API contract.
 */
export const revalidate = false;
export const dynamic = 'force-static';

export function GET() {
  return getCanonicalArtistOpenApi();
}
