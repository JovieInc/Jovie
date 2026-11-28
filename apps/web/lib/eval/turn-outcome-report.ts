import 'server-only';

import { and, asc, gte, inArray } from 'drizzle-orm';
import { decodeToolEvents } from '@/lib/chat/tool-events';
import { db } from '@/lib/db';
import { chatMessages } from '@/lib/db/schema/chat';
import {
  ACTION_INTENTS,
  type ActionIntent,
  isTurnOutcomeFailure,
  judgeTurnOutcome,
  type TurnOutcome,
} from './turn-outcome';

/**
 * Daily transcript judge (read only). Pairs each artist message from the last
 * day with the reply that followed, judges the outcome, and reports one
 * finding per action intent that stalled. The synthetic-monitoring job files
 * or resolves one Linear repair issue per finding key; a key that stops
 * appearing the next day resolves its issue.
 *
 * Findings carry ids and reasons only, never message text: artist chat stays
 * out of Linear.
 */

export const CHAT_OUTCOME_WINDOW_HOURS = 24;
const MAX_MESSAGES = 5_000;
const MAX_SAMPLES = 5;

export type ChatOutcomeFindingKey = `chat-stall-${ActionIntent}`;

export const CHAT_OUTCOME_KEYS: readonly ChatOutcomeFindingKey[] =
  ACTION_INTENTS.map(intent => `chat-stall-${intent}` as const);

export interface ChatOutcomeFinding {
  readonly key: ChatOutcomeFindingKey;
  readonly title: string;
  readonly detail: string;
  readonly evidence: {
    readonly stalled: number;
    readonly judged: number;
    readonly reasons: Record<string, number>;
    readonly sampleTurns: readonly { conversationId: string; at: string }[];
  };
}

export interface ChatOutcomeReport {
  readonly checkedAt: string;
  readonly windowHours: number;
  /** Intents with at least one judged turn: only these can resolve. */
  readonly checks: readonly ChatOutcomeFindingKey[];
  readonly findings: readonly ChatOutcomeFinding[];
  readonly totals: {
    readonly turns: number;
    readonly actionTurns: number;
    readonly stalled: number;
    readonly trailingAsks: number;
    readonly overBudget: number;
  };
}

export interface JudgedTurnRow {
  readonly conversationId: string;
  readonly at: Date;
  readonly outcome: TurnOutcome;
}

interface MessageRow {
  readonly conversationId: string;
  readonly role: string;
  readonly content: string;
  readonly toolCalls: unknown;
  readonly createdAt: Date;
}

/** Pair each user message with the next assistant message in its conversation. */
export function judgeMessageRows(rows: readonly MessageRow[]): JudgedTurnRow[] {
  const judged: JudgedTurnRow[] = [];
  const pendingUser = new Map<string, MessageRow>();
  for (const row of rows) {
    if (row.role === 'user') {
      pendingUser.set(row.conversationId, row);
      continue;
    }
    const user = pendingUser.get(row.conversationId);
    if (!user) continue;
    pendingUser.delete(row.conversationId);
    judged.push({
      conversationId: row.conversationId,
      at: row.createdAt,
      outcome: judgeTurnOutcome({
        userText: user.content,
        assistantText: row.content,
        toolEvents: decodeToolEvents(row.toolCalls).events,
      }),
    });
  }
  return judged;
}

const INTENT_LABEL: Record<ActionIntent, string> = {
  merch: 'make merch',
  task: 'create a task',
  release: 'set up a release',
  bio: 'write a bio',
};

export function buildChatOutcomeReport(
  turns: readonly JudgedTurnRow[],
  checkedAt: Date
): ChatOutcomeReport {
  const checks = new Set<ChatOutcomeFindingKey>();
  const byIntent = new Map<ActionIntent, JudgedTurnRow[]>();
  const judgedByIntent = new Map<ActionIntent, number>();
  for (const turn of turns) {
    const { intent } = turn.outcome;
    if (!intent) continue;
    checks.add(`chat-stall-${intent}`);
    judgedByIntent.set(intent, (judgedByIntent.get(intent) ?? 0) + 1);
    if (!isTurnOutcomeFailure(turn.outcome)) continue;
    byIntent.set(intent, [...(byIntent.get(intent) ?? []), turn]);
  }
  const findings: ChatOutcomeFinding[] = [...byIntent.entries()].map(
    ([intent, stalled]) => {
      const reasons: Record<string, number> = {};
      for (const turn of stalled)
        for (const reason of turn.outcome.reasons)
          reasons[reason] = (reasons[reason] ?? 0) + 1;
      const judged = judgedByIntent.get(intent) ?? stalled.length;
      return {
        key: `chat-stall-${intent}`,
        title: `chat did not ${INTENT_LABEL[intent]} (${stalled.length} of ${judged} asks)`,
        detail: `In the last ${CHAT_OUTCOME_WINDOW_HOURS} hours, ${stalled.length} of ${judged} "${INTENT_LABEL[intent]}" asks ended without the action: no successful tool result, or an empty one, and often a question back to the artist. Fix the tool or prompt so the ask is carried out with a sensible default.`,
        evidence: {
          stalled: stalled.length,
          judged,
          reasons,
          sampleTurns: stalled.slice(0, MAX_SAMPLES).map(turn => ({
            conversationId: turn.conversationId,
            at: turn.at.toISOString(),
          })),
        },
      };
    }
  );
  return {
    checkedAt: checkedAt.toISOString(),
    windowHours: CHAT_OUTCOME_WINDOW_HOURS,
    checks: [...checks],
    findings,
    totals: {
      turns: turns.length,
      actionTurns: turns.filter(turn => turn.outcome.intent).length,
      stalled: turns.filter(turn => isTurnOutcomeFailure(turn.outcome)).length,
      trailingAsks: turns.filter(turn =>
        turn.outcome.reasons.includes('reply.trailing_ask')
      ).length,
      overBudget: turns.filter(turn =>
        turn.outcome.reasons.some(reason =>
          reason.startsWith('reply.over_budget')
        )
      ).length,
    },
  };
}

export async function runChatOutcomeJudge(
  now: Date = new Date()
): Promise<ChatOutcomeReport> {
  const since = new Date(
    now.getTime() - CHAT_OUTCOME_WINDOW_HOURS * 60 * 60 * 1000
  );
  const rows = await db
    .select({
      conversationId: chatMessages.conversationId,
      role: chatMessages.role,
      content: chatMessages.content,
      toolCalls: chatMessages.toolCalls,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .where(
      and(
        gte(chatMessages.createdAt, since),
        inArray(chatMessages.role, ['user', 'assistant'])
      )
    )
    .orderBy(asc(chatMessages.conversationId), asc(chatMessages.createdAt))
    .limit(MAX_MESSAGES);
  return buildChatOutcomeReport(judgeMessageRows(rows), now);
}
