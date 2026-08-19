import { NextResponse } from 'next/server';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import {
  handleOvieMcpRequest,
  UNAUTHENTICATED_WWW_AUTHENTICATE,
} from '@/lib/ovie/mcp/handler';
import { extractBearer, getOvieOAuthIssuer } from '@/lib/ovie/mcp/oauth';
import type { OvieMcpPrincipal } from '@/lib/ovie/mcp/types';

export const dynamic = 'force-dynamic';

function issuerSecret(): string {
  return (
    process.env.BETTER_AUTH_SECRET ||
    'jovie-non-production-better-auth-fallback-secret'
  );
}

async function resolvePrincipal(request: Request): Promise<OvieMcpPrincipal> {
  const bearer = extractBearer(request.headers.get('authorization'));
  if (bearer) {
    const claims = getOvieOAuthIssuer(issuerSecret()).verifyAccessToken(bearer);
    if (claims) {
      return {
        authenticated: true,
        isAdmin: claims.isAdmin,
        subject: claims.sub,
        email: claims.email,
        scopes: claims.scopes,
      };
    }
    return {
      authenticated: false,
      isAdmin: false,
      scopes: [],
    };
  }

  const entitlements = await getCurrentUserEntitlements();
  return {
    authenticated: entitlements.isAuthenticated,
    isAdmin: entitlements.isAdmin,
    subject: entitlements.userId ?? undefined,
    email: entitlements.email ?? undefined,
    scopes: entitlements.isAdmin ? ['ovie:read', 'ovie:write'] : [],
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  const body: unknown = await request.json().catch(() => null);
  const principal = await resolvePrincipal(request);
  const result = handleOvieMcpRequest({ body, principal });
  if (result.body === null) {
    return new NextResponse(null, { status: result.status });
  }
  return NextResponse.json(result.body, {
    status: result.status,
    headers: result.headers,
  });
}

export async function GET(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 401,
    headers: { 'www-authenticate': UNAUTHENTICATED_WWW_AUTHENTICATE },
  });
}
