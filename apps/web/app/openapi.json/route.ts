import { artistOpenApiGET } from '@/lib/api/v1/openapi';

export const revalidate = false;
export const dynamic = 'force-static';

/** Conventional root discovery surface. Same contract as `/api/v1/openapi.json`. */
export function GET() {
  return artistOpenApiGET();
}
