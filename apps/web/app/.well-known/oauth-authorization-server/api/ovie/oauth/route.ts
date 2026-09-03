import { NextResponse } from 'next/server';
import { getOvieOAuthIssuer, ovieIssuerSecret } from '@/lib/ovie/mcp/oauth';
import { OVIE_OAUTH_DISCOVERY_HEADERS } from '@/lib/ovie/mcp/oauth-contract';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const origin = new URL(request.url).origin;
  return NextResponse.json(
    getOvieOAuthIssuer(ovieIssuerSecret()).metadata(origin),
    {
      headers: OVIE_OAUTH_DISCOVERY_HEADERS,
    }
  );
}
