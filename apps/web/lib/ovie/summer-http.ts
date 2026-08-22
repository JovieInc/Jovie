import { NextResponse } from 'next/server';
import { authorizeSummerControl } from '@/lib/ovie/control';
import type { OperatingStore } from '@/lib/ovie/mcp/store';
import type { OvieMcpPrincipal } from '@/lib/ovie/mcp/types';
import {
  claimOvieSummerTurn,
  completeOvieSummerTurn,
  failOvieSummerTurn,
  listOvieSummerTurnsForLander,
  OvieSummerTurnError,
} from '@/lib/ovie/summer-conversation';

function authorize(input: {
  readonly principal: OvieMcpPrincipal;
  readonly scope: 'ovie:read' | 'ovie:write';
}): NextResponse | undefined {
  const gate = authorizeSummerControl(input.principal);
  if (!gate.ok) {
    return NextResponse.json({ ok: false }, { status: gate.status });
  }
  if (!input.principal.scopes.includes(input.scope)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  return undefined;
}

export async function respondToOvieSummerPending(input: {
  readonly principal: OvieMcpPrincipal;
  readonly store: OperatingStore;
}): Promise<NextResponse> {
  const denied = authorize({ principal: input.principal, scope: 'ovie:read' });
  if (denied) return denied;
  const turns = await listOvieSummerTurnsForLander(input.store);
  return NextResponse.json({
    ok: true,
    turns: turns.map(turn => ({
      id: turn.id,
      conversation_id: turn.conversationId,
      user_text: turn.userText,
      state: turn.state,
      eve_work_id: turn.eveWorkId ?? null,
      created_at: turn.createdAt,
    })),
  });
}

export async function respondToOvieSummerAction(input: {
  readonly principal: OvieMcpPrincipal;
  readonly store: OperatingStore;
  readonly body: unknown;
}): Promise<NextResponse> {
  const denied = authorize({ principal: input.principal, scope: 'ovie:write' });
  if (denied) return denied;
  const body =
    input.body && typeof input.body === 'object'
      ? (input.body as Record<string, unknown>)
      : {};
  const action = typeof body.action === 'string' ? body.action : '';
  const id = typeof body.id === 'string' ? body.id.trim() : '';
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });

  if (action === 'claim') {
    const workerId =
      typeof body.worker_id === 'string' ? body.worker_id.trim() : '';
    if (!workerId) return NextResponse.json({ ok: false }, { status: 400 });
    const claimed = await claimOvieSummerTurn(input.store, { id, workerId });
    if (!claimed?.claimToken) {
      return NextResponse.json({ ok: false }, { status: 409 });
    }
    return NextResponse.json({
      ok: true,
      turn: {
        id: claimed.id,
        conversation_id: claimed.conversationId,
        user_text: claimed.userText,
        claim_token: claimed.claimToken,
        claim_expires_at: claimed.claimExpiresAt,
        eve_work_id: claimed.eveWorkId ?? null,
      },
    });
  }

  const claimToken =
    typeof body.claim_token === 'string' ? body.claim_token.trim() : '';
  try {
    if (action === 'complete') {
      const responseText =
        typeof body.response_text === 'string' ? body.response_text.trim() : '';
      if (!claimToken || !responseText) {
        return NextResponse.json({ ok: false }, { status: 400 });
      }
      const toolBody =
        body.tool && typeof body.tool === 'object'
          ? (body.tool as Record<string, unknown>)
          : null;
      const completed = await completeOvieSummerTurn(input.store, {
        id,
        claimToken,
        responseText,
        tool:
          toolBody &&
          typeof toolBody.name === 'string' &&
          typeof toolBody.receiptId === 'string' &&
          typeof toolBody.summary === 'string'
            ? {
                name: toolBody.name,
                ok: toolBody.ok === true,
                receiptId: toolBody.receiptId,
                summary: toolBody.summary,
              }
            : undefined,
      });
      return NextResponse.json({
        ok: true,
        turn: { id: completed.id, state: completed.state },
      });
    }
    if (action === 'fail') {
      const failureCode =
        typeof body.failure_code === 'string' ? body.failure_code.trim() : '';
      if (!claimToken || !failureCode) {
        return NextResponse.json({ ok: false }, { status: 400 });
      }
      const failed = await failOvieSummerTurn(input.store, {
        id,
        claimToken,
        failureCode,
      });
      return NextResponse.json({
        ok: true,
        turn: { id: failed.id, state: failed.state },
      });
    }
  } catch (error) {
    if (error instanceof OvieSummerTurnError) {
      return NextResponse.json({ ok: false }, { status: 409 });
    }
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  return NextResponse.json({ ok: false }, { status: 400 });
}
