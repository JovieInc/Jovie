import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionContext } from '@/lib/auth/session';
import { getOvieOperatingStore } from '@/lib/ovie/mcp/runtime-store';
import { authorizeFounderSummerUser } from '@/lib/ovie/summer-founder-auth';
import {
  CURRENT_SUMMER_IDENTITY,
  SUMMER_SESSION_DECISION_ID,
} from '@/lib/ovie/summer-session';
import { getSessionErrorResponse } from '../../../chat/session-error-response';

export const dynamic = 'force-dynamic';
const headers = {
  'Cache-Control': 'private, no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
};
const turnSchema = z.object({
  turnIndex: z.number().int().nonnegative().safe(),
  clientTurnId: z.string().min(1).nullable(),
  userText: z.string(),
  assistantText: z.string(),
  state: z.string().min(1).max(128),
  createdAt: z.string().datetime(),
  toolReceipt: z.object({ summary: z.string(), ok: z.boolean() }).nullable(),
});
const sessionSchema = z.object({
  identity: z.object({
    speaker: z.literal(CURRENT_SUMMER_IDENTITY.speaker),
    sessionId: z.literal(CURRENT_SUMMER_IDENTITY.sessionId),
    memoryNamespace: z.literal(CURRENT_SUMMER_IDENTITY.memoryNamespace),
    runtime: z.literal(CURRENT_SUMMER_IDENTITY.runtime),
    authority: z.literal(CURRENT_SUMMER_IDENTITY.authority),
  }),
  turns: z.array(turnSchema).superRefine((turns, ctx) => {
    const clients = new Set<string>();
    const indexes = new Set<number>();
    for (const turn of turns) {
      if (
        indexes.has(turn.turnIndex) ||
        (turn.clientTurnId && clients.has(turn.clientTurnId))
      ) {
        ctx.addIssue({ code: 'custom', message: 'Duplicate Summer turn' });
      }
      indexes.add(turn.turnIndex);
      if (turn.clientTurnId) clients.add(turn.clientTurnId);
    }
  }),
});

function unavailable(error: string, status = 503) {
  return NextResponse.json({ error }, { status, headers });
}

/** Read the existing authoritative record only. No provider, migration or create. */
export async function GET() {
  let userId: string;
  try {
    const { user } = await getSessionContext({ requireUser: true });
    userId = user.id;
  } catch (error) {
    return (
      getSessionErrorResponse(error, headers) ??
      unavailable(
        'Summer history is unavailable. Do not resend the original turn.'
      )
    );
  }
  const authorization = authorizeFounderSummerUser(userId);
  if (authorization !== 'authorized') {
    return unavailable(
      'Summer history requires the configured founder session.',
      authorization === 'unconfigured' ? 503 : 403
    );
  }
  let raw: string | undefined;
  try {
    // Despite its name, this is a read-only authoritative read (no cache fill).
    // load/relaunch helpers intentionally are NOT used: they migrate/create.
    raw = (
      await getOvieOperatingStore().getDecisionForUpdate(
        SUMMER_SESSION_DECISION_ID
      )
    )?.decided;
  } catch {
    return unavailable(
      'Summer history is unavailable. Do not resend the original turn.'
    );
  }
  if (raw === undefined) {
    return unavailable(
      'No existing Summer history was found. No session was created. Do not resend the original turn.',
      404
    );
  }
  let session: z.infer<typeof sessionSchema>;
  try {
    session = sessionSchema.parse(JSON.parse(raw));
  } catch {
    return unavailable(
      'Summer history identity or recorded turns could not be verified. Do not resend the original turn.',
      409
    );
  }
  const messages = [...session.turns]
    .sort((a, b) => a.turnIndex - b.turnIndex)
    .flatMap(turn => {
      const id = `summer-history:${turn.turnIndex}`;
      const content = [
        turn.assistantText,
        turn.toolReceipt
          ? `Recorded tool result (${turn.toolReceipt.ok ? 'succeeded' : 'failed'}): ${turn.toolReceipt.summary}`
          : '',
        turn.state !== 'completed'
          ? `Summer turn status: ${turn.state}. Do not resend this message until the original turn has been reconciled.`
          : '',
      ]
        .filter(Boolean)
        .join('\n\n');
      return [
        ...(turn.userText
          ? [
              {
                id: `${id}:user`,
                role: 'user' as const,
                content: turn.userText,
                clientMessageId: turn.clientTurnId
                  ? `${turn.clientTurnId}:user`
                  : null,
                createdAt: turn.createdAt,
              },
            ]
          : []),
        {
          id: `${id}:assistant`,
          role: 'assistant' as const,
          content,
          clientMessageId: turn.clientTurnId
            ? `assistant:${turn.clientTurnId}`
            : null,
          createdAt: turn.createdAt,
        },
      ];
    });
  // Explicit projection: never expose provider receipts, checkpoints or raw rows.
  return NextResponse.json(
    {
      chatMode: 'ov',
      conversation: { id: session.identity.sessionId, title: 'Summer' },
      messages,
      hasMore: false,
    },
    { headers }
  );
}
