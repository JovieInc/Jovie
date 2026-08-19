import { NextResponse } from 'next/server';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import {
  handleOvieMcpRequest,
  UNAUTHENTICATED_WWW_AUTHENTICATE,
} from '@/lib/ovie/mcp/handler';
import {
  extractBearer,
  getOvieOAuthIssuer,
  ovieIssuerSecret,
} from '@/lib/ovie/mcp/oauth';
import {
  DurableOperatingStore,
  getDefaultOperatingStore,
  redisRecordBackend,
} from '@/lib/ovie/mcp/store';
import type { OvieMcpPrincipal } from '@/lib/ovie/mcp/types';
import { getRedis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers':
    'Authorization, Content-Type, MCP-Protocol-Version',
};

async function resolvePrincipal(request: Request): Promise<OvieMcpPrincipal> {
  const bearer = extractBearer(request.headers.get('authorization'));
  if (bearer) {
    const claims = getOvieOAuthIssuer(ovieIssuerSecret()).verifyAccessToken(
      bearer
    );
    if (claims) {
      return {
        authenticated: true,
        isAdmin: claims.isAdmin,
        subject: claims.sub,
        email: claims.email,
        scopes: claims.scopes,
      };
    }
    return { authenticated: false, isAdmin: false, scopes: [] };
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

function operatingStore() {
  const redis = getRedis();
  return redis
    ? new DurableOperatingStore(redisRecordBackend(redis))
    : getDefaultOperatingStore();
}

export async function POST(request: Request): Promise<NextResponse> {
  const body: unknown = await request.json().catch(() => null);
  const result = await handleOvieMcpRequest({
    body,
    principal: await resolvePrincipal(request),
    store: operatingStore(),
  });
  if (result.body === null) {
    return new NextResponse(null, { status: result.status, headers: CORS });
  }
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { ...CORS, ...result.headers },
  });
}

export async function GET(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 401,
    headers: { ...CORS, 'www-authenticate': UNAUTHENTICATED_WWW_AUTHENTICATE },
  });
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS });
}
