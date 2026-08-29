import { artistOpenApiGET } from '@/lib/api/v1/openapi';

export const revalidate = false;
export const dynamic = 'force-static';

export function GET() {
  return artistOpenApiGET();
}
