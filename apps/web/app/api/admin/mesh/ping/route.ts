import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getFreshAuth } from '@/lib/auth/cached';
import { captureError } from '@/lib/error-tracking';
import { parseJsonBody } from '@/lib/http/parse-json';
import {
  MESH_NO_STORE_HEADERS,
  meshJsonNoStore,
} from '@/lib/ovie/mesh/api.server';
import {
  meshCredentialsFromEnv,
  sendMeshPing,
} from '@/lib/ovie/mesh/ping.server';
import { getSummerMeshOrigin } from '@/lib/ovie/mesh/read.server';
import { getMeshAgent } from '@/lib/ovie/mesh/registry';
import { requireOvieApiAccess } from '@/lib/ovie/privacy-lock/access';
import {
  createRateLimitHeaders,
  meshPingLimiter,
  rateLimitDenialStatus,
} from '@/lib/rate-limit';

export const runtime = 'nodejs';

const meshPingBodySchema = z.object({ agentId: z.string().max(64) });

/** POST /api/admin/mesh/ping — send a jovie.mesh-ping/v1 test message. */
export async function POST(request: NextRequest) {
  const denied = await requireOvieApiAccess();
  if (denied) return denied;

  const parsed = await parseJsonBody(request, {
    route: '/api/admin/mesh/ping',
  });
  if (!parsed.ok) return parsed.response;
  const body = meshPingBodySchema.safeParse(parsed.data);
  const agent = body.success ? getMeshAgent(body.data.agentId) : undefined;
  if (!body.success || !agent) {
    return meshJsonNoStore({ error: 'Unknown agent.' }, 400);
  }
  if (!agent.meshKind) {
    return meshJsonNoStore({ error: 'Agent is not a mesh recipient.' }, 400);
  }

  // Abuse cap: MESH_PING_HOURLY_LIMIT pings per agent per hour, enforced
  // server-side (Redis-backed; unavailable backend fails closed).
  const result = await meshPingLimiter.limit(`mesh_ping:${agent.id}`);
  if (!result.success) {
    return NextResponse.json(
      { error: 'Ping cap reached for this agent. Try again later.' },
      {
        status: rateLimitDenialStatus(result),
        headers: {
          ...MESH_NO_STORE_HEADERS,
          ...createRateLimitHeaders(result),
        },
      }
    );
  }

  const origin = getSummerMeshOrigin();
  const credentials = meshCredentialsFromEnv();
  if (!origin || !credentials) {
    return meshJsonNoStore(
      { error: 'Mesh endpoint or credentials are not configured.' },
      503
    );
  }

  const auth = await getFreshAuth();
  try {
    const ping = await sendMeshPing({
      agentKind: agent.meshKind,
      origin,
      credentials,
    });
    if (!ping.ok) {
      await captureError('Mesh ping failed', ping.reason, {
        route: '/api/admin/mesh/ping',
        agentId: agent.id,
        actorUserId: auth.userId,
      });
      return meshJsonNoStore(
        { error: 'Mesh ping could not be delivered.' },
        502
      );
    }
    return meshJsonNoStore({ success: true });
  } catch (error) {
    await captureError('Mesh ping crashed', error, {
      route: '/api/admin/mesh/ping',
      agentId: agent.id,
    });
    return meshJsonNoStore({ error: 'Mesh ping could not be delivered.' }, 502);
  }
}
