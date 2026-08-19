import { NextResponse } from 'next/server';
import { getOvieOAuthIssuer } from '@/lib/ovie/mcp/oauth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const origin = new URL(request.url).origin;
  return NextResponse.json(
    getOvieOAuthIssuer(
      process.env.BETTER_AUTH_SECRET ||
        'jovie-non-production-better-auth-fallback-secret'
    ).metadata(origin)
  );
}
