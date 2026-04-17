#!/usr/bin/env tsx

import { pathToFileURL } from 'node:url';
import { and, eq, gt, isNotNull } from 'drizzle-orm';
import {
  decodeToolEvents,
  type PersistedToolEvent,
} from '@/lib/chat/tool-events';
import { db } from '@/lib/db';
import { chatMessages } from '@/lib/db/schema/chat';

interface BackfillArgs {
  readonly dryRun: boolean;
  readonly limit: number;
  readonly cursor: string | null;
}

interface BackfillDecision {
  readonly source: 'empty' | 'v2' | 'legacy' | 'invalid';
  readonly events: PersistedToolEvent[] | null;
}

interface BackfillSummary {
  readonly dryRun: boolean;
  readonly scanned: number;
  readonly updated: number;
  readonly skipped: number;
  readonly invalid: number;
  readonly nextCursor: string | null;
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1_000;

export function parseBackfillArgs(argv: readonly string[]): BackfillArgs {
  let dryRun = false;
  let limit = DEFAULT_LIMIT;
  let cursor: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === '--dry-run') {
      dryRun = true;
      continue;
    }

    if (value === '--limit') {
      const nextValue = argv[index + 1];
      const parsed = Number.parseInt(nextValue ?? '', 10);

      if (!Number.isFinite(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
        throw new Error(
          `--limit must be an integer between 1 and ${MAX_LIMIT}.`
        );
      }

      limit = parsed;
      index += 1;
      continue;
    }

    if (value === '--cursor') {
      const nextValue = argv[index + 1];

      if (!nextValue) {
        throw new Error('--cursor requires a message id.');
      }

      cursor = nextValue;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${value}`);
  }

  return { dryRun, limit, cursor };
}

export function getBackfillDecision(toolCalls: unknown): BackfillDecision {
  const decoded = decodeToolEvents(toolCalls);

  if (decoded.source === 'legacy') {
    return {
      source: decoded.source,
      events: decoded.events.length > 0 ? decoded.events : null,
    };
  }

  return { source: decoded.source, events: null };
}

export async function backfillChatToolEvents({
  dryRun,
  limit,
  cursor,
}: BackfillArgs): Promise<BackfillSummary> {
  const rows = await db
    .select({
      id: chatMessages.id,
      toolCalls: chatMessages.toolCalls,
    })
    .from(chatMessages)
    .where(
      cursor
        ? and(isNotNull(chatMessages.toolCalls), gt(chatMessages.id, cursor))
        : isNotNull(chatMessages.toolCalls)
    )
    .orderBy(chatMessages.id)
    .limit(limit);

  let updated = 0;
  let skipped = 0;
  let invalid = 0;

  for (const row of rows) {
    const decision = getBackfillDecision(row.toolCalls);

    if (decision.source === 'legacy' && decision.events) {
      if (!dryRun) {
        await db
          .update(chatMessages)
          .set({ toolCalls: decision.events })
          .where(eq(chatMessages.id, row.id));
      }

      updated += 1;
      continue;
    }

    if (decision.source === 'invalid') {
      invalid += 1;
      continue;
    }

    skipped += 1;
  }

  return {
    dryRun,
    scanned: rows.length,
    updated,
    skipped,
    invalid,
    nextCursor: rows.at(-1)?.id ?? null,
  };
}

async function main() {
  const args = parseBackfillArgs(process.argv.slice(2));
  const summary = await backfillChatToolEvents(args);

  console.log(
    JSON.stringify(
      {
        ...summary,
        mode: summary.dryRun ? 'dry-run' : 'write',
      },
      null,
      2
    )
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void main().catch(error => {
    console.error('Chat tool event backfill failed:', error);
    process.exit(1);
  });
}
