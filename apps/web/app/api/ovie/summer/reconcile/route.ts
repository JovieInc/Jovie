import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionContext } from '@/lib/auth/session';
import { env } from '@/lib/env-server';
import { getOvieOperatingStore } from '@/lib/ovie/mcp/runtime-store';
import {
  authorizeFounderSummerUser,
  founderPrincipalHash,
} from '@/lib/ovie/summer-founder-auth';
import { appendSummerTurnWithOutcome } from '@/lib/ovie/summer-session';
import { fetchSummerShadow } from '@/lib/ovie/summer-shadow-client';
import { logger } from '@/lib/utils/logger';
import { getSessionErrorResponse } from '../../../chat/session-error-response';
import { SUMMER_RECOVERY_TARGET } from './target';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
} as const;
const MAX_RESPONSE_BYTES = 128 * 1024;

/**
 * One source-reviewed recovery target. The browser cannot choose an event or
 * deployment. Summer's immutable acceptance record remains the authority.
 */
const resultEnvelopeSchema = z
  .object({
    ok: z.literal(true),
    result: z
      .object({
        eventId: z.string().regex(/^sum_[A-Za-z0-9_-]{24}$/u),
        conversationId: z.literal('summer-session-current'),
        principalHash: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
        deploymentId: z.string().regex(/^dpl_[A-Za-z0-9]+$/u),
        sessionId: z.string().regex(/^(?:ses_|wrun_)[A-Za-z0-9_-]+$/u),
        turnId: z.string().min(1).max(128),
        responseText: z.string().max(64 * 1024),
        status: z.enum(['completed', 'failed']),
        nextStartIndex: z.number().int().nonnegative().safe(),
        model: z.literal('zai/glm-5.3-flash'),
      })
      .strict(),
  })
  .strict();

function json(body: Readonly<Record<string, unknown>>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: NO_STORE_HEADERS,
  });
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength && Number(declaredLength) > MAX_RESPONSE_BYTES) {
    throw new Error('oversized_summer_response');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('missing_summer_response');
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => {});
      throw new Error('oversized_summer_response');
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return JSON.parse(text) as unknown;
}

export async function GET(): Promise<NextResponse> {
  let userId: string;
  try {
    const { user } = await getSessionContext({ requireUser: true });
    userId = user.id;
  } catch (error) {
    const authResponse = getSessionErrorResponse(error, NO_STORE_HEADERS);
    if (authResponse) return authResponse;
    return json({ ok: false, code: 'founder_session_unavailable' }, 503);
  }

  const authorization = authorizeFounderSummerUser(userId);
  if (authorization !== 'authorized') {
    return json(
      {
        ok: false,
        code:
          authorization === 'unconfigured'
            ? 'founder_identity_unconfigured'
            : 'founder_access_required',
      },
      authorization === 'unconfigured' ? 503 : 403
    );
  }
  if (process.env.VERCEL_ENV !== 'production') {
    return json({ ok: false, code: 'production_origin_required' }, 503);
  }

  const expectedEveDeployment =
    env.OVIE_SUMMER_EVE_EXPECTED_DEPLOYMENT_ID?.trim();
  if (!expectedEveDeployment) {
    return json({ ok: false, code: 'eve_deployment_unconfigured' }, 503);
  }
  const principalHash = founderPrincipalHash(userId);

  let upstream: Response;
  try {
    upstream = await fetchSummerShadow(
      `/ovie/v1/summer-shadow/conversation/events/${SUMMER_RECOVERY_TARGET.eventId}/result`,
      {
        method: 'GET',
        headers: {
          'x-jovie-summer-principal-hash': principalHash,
          'x-jovie-summer-deployment-id': SUMMER_RECOVERY_TARGET.deploymentId,
        },
      }
    );
  } catch {
    return json({ ok: false, code: 'summer_result_unavailable' }, 503);
  }

  if (
    upstream.headers.get('x-jovie-eve-deployment-id') !== expectedEveDeployment
  ) {
    return json({ ok: false, code: 'unverified_eve_deployment' }, 503);
  }
  if (!upstream.ok) {
    return json({ ok: false, code: 'summer_result_pending' }, 503);
  }

  let parsed: z.infer<typeof resultEnvelopeSchema>;
  try {
    parsed = resultEnvelopeSchema.parse(await readBoundedJson(upstream));
  } catch {
    return json({ ok: false, code: 'invalid_summer_result' }, 502);
  }
  const { result } = parsed;
  if (
    result.eventId !== SUMMER_RECOVERY_TARGET.eventId ||
    result.principalHash !== principalHash ||
    result.deploymentId !== SUMMER_RECOVERY_TARGET.deploymentId ||
    result.sessionId !== SUMMER_RECOVERY_TARGET.sessionId
  ) {
    return json({ ok: false, code: 'summer_result_binding_drift' }, 502);
  }
  if (result.status !== 'completed' || !result.responseText.trim()) {
    return json({ ok: false, code: 'summer_result_not_completed' }, 409);
  }

  const recoveryClientTurnId = `summer-reconcile:${result.eventId}`;
  try {
    const store = getOvieOperatingStore();
    const appended = await appendSummerTurnWithOutcome(store, {
      clientTurnId: recoveryClientTurnId,
      userText: '',
      assistantText: result.responseText,
      eveWorkId: null,
      eveAcks: [],
      correlationId: recoveryClientTurnId,
      state: 'completed',
      toolReceipt: null,
      eveReceipt: {
        eventId: result.eventId,
        sessionId: result.sessionId,
        turnId: result.turnId,
        nextStartIndex: result.nextStartIndex,
      },
      createdAt: new Date().toISOString(),
    });
    const committed = appended.session.turns.find(
      turn => turn.clientTurnId === recoveryClientTurnId
    );
    if (!committed) {
      throw new Error('committed_recovery_turn_missing');
    }
    if (
      committed.assistantText !== result.responseText ||
      committed.state !== 'completed' ||
      committed.eveReceipt?.eventId !== result.eventId ||
      committed.eveReceipt.sessionId !== result.sessionId ||
      committed.eveReceipt.turnId !== result.turnId ||
      committed.eveReceipt.nextStartIndex !== result.nextStartIndex
    ) {
      return json({ ok: false, code: 'persisted_result_drift' }, 409);
    }
    if (appended.persisted === 'existing') {
      return json({ ok: true, persisted: 'existing', result }, 200);
    }
    return json({ ok: true, persisted: 'created', result }, 200);
  } catch (error) {
    logger.error('[summer-reconcile] Exact result persistence failed', error);
    return json({ ok: false, code: 'summer_result_persistence_failed' }, 503);
  }
}
