import { NextResponse } from 'next/server';
import { authorizeSummerControl } from '@/lib/ovie/control';
import type { OperatingStore } from '@/lib/ovie/mcp/store';
import {
  claimOvieSummerTurn,
  completeOvieSummerTurn,
  failOvieSummerTurn,
  listOvieSummerTurnsForLander,
  OvieSummerTurnClaimError,
} from '@/lib/ovie/summer-conversation';

type SummerHttpPrincipal = {
  readonly authenticated: boolean;
  readonly isAdmin: boolean;
  readonly scopes: readonly string[];
};

function authorize(input: {
  readonly principal: SummerHttpPrincipal;
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
  readonly principal: SummerHttpPrincipal;
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
      created_at: turn.createdAt,
    })),
  });
}

export async function respondToOvieSummerAction(input: {
  readonly principal: SummerHttpPrincipal;
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
    const claimed = await claimOvieSummerTurn(input.store, {
      id,
      workerId,
    });
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
      },
    });
  }

  if (action === 'complete') {
    const claimToken =
      typeof body.claim_token === 'string' ? body.claim_token.trim() : '';
    const responseText =
      typeof body.response_text === 'string' ? body.response_text.trim() : '';
    if (!claimToken || !responseText) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    try {
      const completed = await completeOvieSummerTurn(input.store, {
        id,
        claimToken,
        responseText,
      });
      return NextResponse.json({
        ok: true,
        turn: { id: completed.id, state: completed.state },
      });
    } catch (error) {
      if (error instanceof OvieSummerTurnClaimError) {
        return NextResponse.json({ ok: false }, { status: 409 });
      }
      return NextResponse.json({ ok: false }, { status: 400 });
    }
  }

  if (action === 'fail') {
    const claimToken =
      typeof body.claim_token === 'string' ? body.claim_token.trim() : '';
    const failureCode =
      typeof body.failure_code === 'string' ? body.failure_code.trim() : '';
    if (!claimToken || !failureCode) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    try {
      const failed = await failOvieSummerTurn(input.store, {
        id,
        claimToken,
        failureCode,
      });
      return NextResponse.json({
        ok: true,
        turn: { id: failed.id, state: failed.state },
      });
    } catch (error) {
      if (error instanceof OvieSummerTurnClaimError) {
        return NextResponse.json({ ok: false }, { status: 409 });
      }
      return NextResponse.json({ ok: false }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: false }, { status: 400 });
}
