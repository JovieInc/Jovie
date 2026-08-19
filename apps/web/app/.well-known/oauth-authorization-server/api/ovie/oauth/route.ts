import { NextResponse } from 'next/server';
import { getOvieOAuthIssuer, ovieIssuerSecret } from '@/lib/ovie/mcp/oauth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const origin = new URL(request.url).origin;
  return NextResponse.json(
    getOvieOAuthIssuer(ovieIssuerSecret()).metadata(origin),
    {
      headers: {
        'access-control-allow-origin': '*',
        'cache-control': 'no-store',
      },
    }
  );
}
