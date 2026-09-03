import { NextResponse } from 'next/server';
import { getOvieOAuthIssuer, ovieIssuerSecret } from '@/lib/ovie/mcp/oauth';
import { OVIE_OAUTH_DISCOVERY_HEADERS } from '@/lib/ovie/mcp/oauth-contract';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const origin = new URL(request.url).origin;
  return NextResponse.json(
    getOvieOAuthIssuer(ovieIssuerSecret()).protectedResourceMetadata(origin),
    {
      headers: OVIE_OAUTH_DISCOVERY_HEADERS,
    }
  );
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...OVIE_OAUTH_DISCOVERY_HEADERS,
      'access-control-allow-methods': 'GET, HEAD, OPTIONS',
    },
  });
}
