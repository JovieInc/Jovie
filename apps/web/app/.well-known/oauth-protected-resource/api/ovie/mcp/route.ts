import { NextResponse } from 'next/server';
import { getOvieOAuthIssuer } from '@/lib/ovie/mcp/oauth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const origin = new URL(request.url).origin;
  return NextResponse.json(
    getOvieOAuthIssuer(
      process.env.BETTER_AUTH_SECRET ||
        'jovie-non-production-better-auth-fallback-secret'
    ).protectedResourceMetadata(origin),
    {
      headers: {
        'access-control-allow-origin': '*',
        'cache-control': 'no-store',
      },
    }
  );
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, HEAD, OPTIONS',
    },
  });
}
