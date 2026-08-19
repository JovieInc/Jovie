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
import { postgresRecordBackend } from '@/lib/ovie/mcp/postgres-backend';
import {
  DurableOperatingStore,
  FailoverOperatingStore,
  OVIE_MCP_INDEX_CAP,
  OVIE_MCP_RECORD_TTL_SECONDS,
  type RecordBackend,
} from '@/lib/ovie/mcp/store';
import type { OvieMcpPrincipal } from '@/lib/ovie/mcp/types';
import { getRedis } from '@/lib/redis';
import { classifyRedisFailure } from '@/lib/redis-operability';

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

const REDIS_QUOTA_SKIP_MS = 15 * 60_000;
const REDIS_UNAVAILABLE_SKIP_MS = 30_000;
let skipRedisUntil = 0;

function redisRecordBackend(
  redis: NonNullable<ReturnType<typeof getRedis>>
): RecordBackend {
  return {
    get: async key => redis.get(key),
    set: async (key, value) => {
      await redis.set(key, value, { ex: OVIE_MCP_RECORD_TTL_SECONDS });
    },
    lpush: async (key, value) => {
      await redis.lpush(key, value);
      await redis.ltrim(key, 0, OVIE_MCP_INDEX_CAP - 1);
    },
    lrange: async (key, start, stop) => {
      const rows = await redis.lrange(key, start, stop);
      return Array.isArray(rows) ? rows.map(String) : [];
    },
  };
}

function postgresOperatingStore() {
  return new DurableOperatingStore(postgresRecordBackend());
}

function operatingStore() {
  const fallback = postgresOperatingStore();
  if (Date.now() < skipRedisUntil) return fallback;
  const redis = getRedis();
  if (!redis) return fallback;
  return new FailoverOperatingStore({
    primary: new DurableOperatingStore(redisRecordBackend(redis)),
    fallback,
    writeThrough: true,
    isPrimaryFailure(error) {
      const kind = classifyRedisFailure(error);
      return kind === 'quota_exceeded' || kind === 'unavailable';
    },
    onPrimaryFailure(error) {
      const kind = classifyRedisFailure(error);
      skipRedisUntil =
        Date.now() +
        (kind === 'quota_exceeded'
          ? REDIS_QUOTA_SKIP_MS
          : REDIS_UNAVAILABLE_SKIP_MS);
    },
  });
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
