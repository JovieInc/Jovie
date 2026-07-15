/**
 * Data Retention Cleanup — Mutation-Sensitive Coverage
 *
 * `apps/web/tests/lib/analytics/data-retention.test.ts` already covers the pure
 * helpers (`getRetentionDays`, `getRetentionCutoffDate`) with a fully-mocked
 * `@/lib/db`. This file covers `runDataRetentionCleanup` itself: the exact
 * cutoff/window each of the 16 cleanup rules uses, the WHERE direction and
 * status/scope filters per rule, the batched-delete loop's halting condition
 * and count aggregation, and cross-rule failure behavior.
 *
 * We intercept `db.select`/`db.execute` and compile the SQL condition each
 * rule builds via drizzle's `PgDialect().sqlToQuery()` (same pattern as
 * `tests/unit/lib/admin/funnel-metrics.test.ts` and
 * `tests/lib/stripe/billing-hardening.test.ts`) so assertions pin the actual
 * generated SQL text and bound params rather than re-deriving them from the
 * source, which is what makes a 7↔1 day or `<`↔`>` mutant fail.
 *
 * NOTE (real finding): contrary to this loop batch's premise, there is no
 * dedicated "7-day ingestion-job deletion rule" in this module.
 * `cleanupIngestionJobs` reuses the *general* `cutoffDate`
 * (`getRetentionCutoffDate(retentionDays)`, default 90 days, configurable via
 * `ANALYTICS_RETENTION_DAYS`) plus a `status IN ('succeeded','failed')`
 * filter. See the "ingestion jobs" describe block below, which pins the
 * actual (90-day-default, configurable) behavior.
 */

import type { SQL } from 'drizzle-orm';
import { getTableConfig, PgDialect, type PgTable } from 'drizzle-orm/pg-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { adminAuditLog } from '@/lib/db/schema/admin';
import {
  audienceMembers,
  clickEvents,
  notificationSubscriptions,
} from '@/lib/db/schema/analytics';
import { billingAuditLog, stripeWebhookEvents } from '@/lib/db/schema/billing';
import { chatAuditLog, chatMessages } from '@/lib/db/schema/chat';
import { emailEngagement } from '@/lib/db/schema/email-engagement';
import { ingestionJobs } from '@/lib/db/schema/ingestion';
import { pixelEvents } from '@/lib/db/schema/pixels';
import { emailSendAttribution } from '@/lib/db/schema/sender';
import {
  emailSuppressions,
  notificationDeliveryLog,
  unsubscribeTokens,
  webhookEvents,
} from '@/lib/db/schema/suppression';

interface SelectCall {
  readonly table: PgTable;
  readonly condition: SQL;
}

const {
  mockSelect,
  mockExecute,
  selectCalls,
  selectCountByTable,
  executeQueueByTableName,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockExecute: vi.fn(),
  selectCalls: [] as SelectCall[],
  selectCountByTable: new Map<PgTable, number>(),
  executeQueueByTableName: new Map<string, number[]>(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockSelect,
    execute: mockExecute,
  },
}));

const dialect = new PgDialect();

function compile(condition: SQL) {
  return dialect.sqlToQuery(condition);
}

function findCall(table: PgTable): SelectCall {
  const found = selectCalls.find(call => call.table === table);
  if (!found) {
    throw new Error(
      `No select() call recorded for table "${getTableConfig(table).name}"`
    );
  }
  return found;
}

/** Mirrors the exact computation in getRetentionCutoffDate(). */
function expectedCutoff(now: Date, days: number): Date {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);
  cutoff.setHours(0, 0, 0, 0);
  return cutoff;
}

const FIXED_NOW = new Date('2024-06-15T18:30:00.000Z');
const DEFAULT_RETENTION_DAYS = 90;
const CHAT_RETENTION_DAYS = 365;

describe('runDataRetentionCleanup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    vi.clearAllMocks();
    selectCalls.length = 0;
    selectCountByTable.clear();
    executeQueueByTableName.clear();
    delete process.env.ANALYTICS_RETENTION_DAYS;

    mockSelect.mockImplementation((_selection: unknown) => ({
      from: (table: PgTable) => ({
        where: (condition: SQL) => {
          selectCalls.push({ table, condition });
          const count = selectCountByTable.get(table) ?? 0;
          return Promise.resolve([{ count }]);
        },
      }),
    }));

    mockExecute.mockImplementation((sqlChunk: SQL) => {
      const compiled = compile(sqlChunk);
      const match = compiled.sql.match(/delete from "([a-z_]+)"/i);
      const tableName = match?.[1] ?? 'unknown';
      const queue = executeQueueByTableName.get(tableName);
      const rowCount = queue && queue.length > 0 ? queue.shift()! : 0;
      return Promise.resolve({ rowCount });
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.ANALYTICS_RETENTION_DAYS;
  });

  describe('dry run — per-rule cutoff, direction, and filter pinning', () => {
    const simpleCreatedAtRules: ReadonlyArray<
      readonly [name: string, table: PgTable]
    > = [
      ['clickEvents', clickEvents],
      ['notificationSubscriptions', notificationSubscriptions],
      ['pixelEvents', pixelEvents],
      ['notificationDeliveryLog', notificationDeliveryLog],
      ['emailEngagement', emailEngagement],
      ['billingAuditLog', billingAuditLog],
      ['adminAuditLog', adminAuditLog],
    ];

    it.each(
      simpleCreatedAtRules
    )('%s: deletes createdAt < default 90-day cutoff (direction + window pinned)', async (_name, table) => {
      const { runDataRetentionCleanup } = await import(
        '@/lib/analytics/data-retention'
      );
      await runDataRetentionCleanup({ dryRun: true });

      const cutoff = expectedCutoff(FIXED_NOW, DEFAULT_RETENTION_DAYS);
      const { sql, params } = compile(findCall(table).condition);
      const { name: tableName } = getTableConfig(table);

      // Direction pinned: "<" not ">" or ">=" etc.
      expect(sql).toContain(`"${tableName}"."created_at" <`);
      expect(sql).not.toContain(`"${tableName}"."created_at" >`);
      // Window pinned to the exact 90-day cutoff — a 7-day or 1-day mutant fails here.
      expect(params).toEqual([cutoff.toISOString()]);
    });

    it('audienceMembers: deletes lastSeenAt < cutoff AND type=anonymous AND email/phone NULL', async () => {
      const { runDataRetentionCleanup } = await import(
        '@/lib/analytics/data-retention'
      );
      await runDataRetentionCleanup({ dryRun: true });

      const cutoff = expectedCutoff(FIXED_NOW, DEFAULT_RETENTION_DAYS);
      const { sql, params } = compile(findCall(audienceMembers).condition);

      expect(sql).toContain('"audience_members"."last_seen_at" <');
      expect(sql).not.toContain('"audience_members"."last_seen_at" >');
      expect(sql).toContain(`"audience_members"."type" = 'anonymous'`);
      expect(sql).toContain('"audience_members"."email" IS NULL');
      expect(sql).toContain('"audience_members"."phone" IS NULL');
      // Only the cutoff timestamp is bound as a param (status/email/phone are literal).
      expect(params).toEqual([cutoff.toISOString()]);
    });

    it('stripeWebhookEvents: deletes processedAt IS NOT NULL AND createdAt < cutoff (only processed rows)', async () => {
      const { runDataRetentionCleanup } = await import(
        '@/lib/analytics/data-retention'
      );
      await runDataRetentionCleanup({ dryRun: true });

      const cutoff = expectedCutoff(FIXED_NOW, DEFAULT_RETENTION_DAYS);
      const { sql, params } = compile(findCall(stripeWebhookEvents).condition);

      expect(sql).toContain(
        '"stripe_webhook_events"."processed_at" is not null'
      );
      expect(sql).toContain('"stripe_webhook_events"."created_at" <');
      expect(params).toEqual([cutoff.toISOString()]);
    });

    it('webhookEvents: deletes processed = true AND createdAt < cutoff (only processed rows)', async () => {
      const { runDataRetentionCleanup } = await import(
        '@/lib/analytics/data-retention'
      );
      await runDataRetentionCleanup({ dryRun: true });

      const cutoff = expectedCutoff(FIXED_NOW, DEFAULT_RETENTION_DAYS);
      const { sql, params } = compile(findCall(webhookEvents).condition);

      expect(sql).toContain('"webhook_events"."processed" =');
      expect(sql).toContain('"webhook_events"."created_at" <');
      // processed=true and the cutoff are both bound params, in that order.
      expect(params).toEqual([true, cutoff.toISOString()]);
    });

    it('ingestionJobs: deletes status IN (succeeded, failed) AND createdAt < the GENERAL 90-day cutoff (NOT a hardcoded 7-day window)', async () => {
      const { runDataRetentionCleanup } = await import(
        '@/lib/analytics/data-retention'
      );
      await runDataRetentionCleanup({ dryRun: true });

      const cutoff = expectedCutoff(FIXED_NOW, DEFAULT_RETENTION_DAYS);
      const { sql, params } = compile(findCall(ingestionJobs).condition);

      expect(sql).toContain('"ingestion_jobs"."status" in ($1, $2)');
      expect(sql).toContain('"ingestion_jobs"."created_at" <');
      expect(sql).not.toContain('"ingestion_jobs"."created_at" >');
      // Scope filter pinned: only terminal-status jobs are eligible for deletion.
      expect(params).toEqual(['succeeded', 'failed', cutoff.toISOString()]);
    });

    it('chatMessages: deletes createdAt < the 365-day CHAT cutoff, distinct from the 90-day default', async () => {
      const { runDataRetentionCleanup } = await import(
        '@/lib/analytics/data-retention'
      );
      await runDataRetentionCleanup({ dryRun: true });

      const chatCutoff = expectedCutoff(FIXED_NOW, CHAT_RETENTION_DAYS);
      const genericCutoff = expectedCutoff(FIXED_NOW, DEFAULT_RETENTION_DAYS);
      const { sql, params } = compile(findCall(chatMessages).condition);

      expect(sql).toContain('"chat_messages"."created_at" <');
      expect(params).toEqual([chatCutoff.toISOString()]);
      expect(params).not.toEqual([genericCutoff.toISOString()]);
    });

    it('chatAuditLog: deletes createdAt < the 365-day CHAT cutoff, distinct from the 90-day default', async () => {
      const { runDataRetentionCleanup } = await import(
        '@/lib/analytics/data-retention'
      );
      await runDataRetentionCleanup({ dryRun: true });

      const chatCutoff = expectedCutoff(FIXED_NOW, CHAT_RETENTION_DAYS);
      const { sql, params } = compile(findCall(chatAuditLog).condition);

      expect(sql).toContain('"chat_audit_log"."created_at" <');
      expect(params).toEqual([chatCutoff.toISOString()]);
    });

    it('unsubscribeTokens: deletes expiresAt < NOW() (not the retention cutoff — an unrelated token-expiry rule)', async () => {
      const { runDataRetentionCleanup } = await import(
        '@/lib/analytics/data-retention'
      );
      await runDataRetentionCleanup({ dryRun: true });

      const { sql, params } = compile(findCall(unsubscribeTokens).condition);

      expect(sql).toBe('"unsubscribe_tokens"."expires_at" < NOW()');
      expect(sql).not.toContain('$1');
      // No bound param at all — the comparison is against the live DB clock, not the JS cutoff.
      expect(params).toEqual([]);
    });

    it('emailSendAttribution: deletes expiresAt < NOW() (not the retention cutoff)', async () => {
      const { runDataRetentionCleanup } = await import(
        '@/lib/analytics/data-retention'
      );
      await runDataRetentionCleanup({ dryRun: true });

      const { sql, params } = compile(findCall(emailSendAttribution).condition);

      expect(sql).toBe('"email_send_attribution"."expires_at" < NOW()');
      expect(params).toEqual([]);
    });

    it('emailSuppressions: deletes expiresAt IS NOT NULL AND expiresAt < NOW()', async () => {
      const { runDataRetentionCleanup } = await import(
        '@/lib/analytics/data-retention'
      );
      await runDataRetentionCleanup({ dryRun: true });

      const { sql, params } = compile(findCall(emailSuppressions).condition);

      expect(sql).toContain('"email_suppressions"."expires_at" is not null');
      expect(sql).toContain('"email_suppressions"."expires_at" < NOW()');
      expect(params).toEqual([]);
    });

    it('custom retentionDays reshapes generic + ingestion cutoffs but NOT the chat cutoff or NOW()-based token rules', async () => {
      const { runDataRetentionCleanup } = await import(
        '@/lib/analytics/data-retention'
      );
      const customDays = 30;
      await runDataRetentionCleanup({
        dryRun: true,
        retentionDays: customDays,
      });

      const customCutoff = expectedCutoff(FIXED_NOW, customDays);
      const chatCutoff = expectedCutoff(FIXED_NOW, CHAT_RETENTION_DAYS);

      expect(compile(findCall(clickEvents).condition).params).toEqual([
        customCutoff.toISOString(),
      ]);
      expect(compile(findCall(ingestionJobs).condition).params).toEqual([
        'succeeded',
        'failed',
        customCutoff.toISOString(),
      ]);
      // Chat retention is pinned to CHAT_RETENTION_DAYS regardless of the override.
      expect(compile(findCall(chatMessages).condition).params).toEqual([
        chatCutoff.toISOString(),
      ]);
      // Token-expiry rules stay NOW()-based regardless of the override.
      expect(compile(findCall(unsubscribeTokens).condition).params).toEqual([]);
    });
  });

  describe('dry run — result field mapping (positional destructure guard)', () => {
    it('maps each Promise.all result to its own field, not a neighbor field', async () => {
      const { runDataRetentionCleanup } = await import(
        '@/lib/analytics/data-retention'
      );

      // Unique count per table so a positional shuffle in the destructure
      // (or in the Promise.all array) shows up as a mismatched field.
      selectCountByTable.set(clickEvents, 101);
      selectCountByTable.set(audienceMembers, 102);
      selectCountByTable.set(notificationSubscriptions, 103);
      selectCountByTable.set(pixelEvents, 104);
      selectCountByTable.set(stripeWebhookEvents, 105);
      selectCountByTable.set(webhookEvents, 106);
      selectCountByTable.set(notificationDeliveryLog, 107);
      selectCountByTable.set(emailEngagement, 108);
      selectCountByTable.set(chatMessages, 109);
      selectCountByTable.set(chatAuditLog, 110);
      selectCountByTable.set(billingAuditLog, 111);
      selectCountByTable.set(adminAuditLog, 112);
      selectCountByTable.set(ingestionJobs, 113);
      selectCountByTable.set(unsubscribeTokens, 114);
      selectCountByTable.set(emailSendAttribution, 115);
      selectCountByTable.set(emailSuppressions, 116);

      const result = await runDataRetentionCleanup({ dryRun: true });

      expect(result.clickEventsDeleted).toBe(101);
      expect(result.audienceMembersDeleted).toBe(102);
      expect(result.notificationSubscriptionsDeleted).toBe(103);
      expect(result.pixelEventsDeleted).toBe(104);
      expect(result.stripeWebhookEventsDeleted).toBe(105);
      expect(result.webhookEventsDeleted).toBe(106);
      expect(result.notificationDeliveryLogDeleted).toBe(107);
      expect(result.emailEngagementDeleted).toBe(108);
      expect(result.chatMessagesDeleted).toBe(109);
      expect(result.chatAuditLogDeleted).toBe(110);
      expect(result.billingAuditLogDeleted).toBe(111);
      expect(result.adminAuditLogDeleted).toBe(112);
      expect(result.ingestionJobsDeleted).toBe(113);
      expect(result.unsubscribeTokensDeleted).toBe(114);
      expect(result.emailSendAttributionDeleted).toBe(115);
      expect(result.emailSuppressionsDeleted).toBe(116);
    });
  });

  describe('real delete (batchDelete) — loop halting + count aggregation', () => {
    it('stops after one batch when the delete count is below BATCH_SIZE (1000)', async () => {
      const { runDataRetentionCleanup } = await import(
        '@/lib/analytics/data-retention'
      );
      executeQueueByTableName.set('click_events', [42]);

      const result = await runDataRetentionCleanup({ dryRun: false });

      expect(result.clickEventsDeleted).toBe(42);
      expect(mockExecute).toHaveBeenCalledTimes(16); // one call per rule, no extra iteration
    });

    it('continues batching while a delete returns exactly BATCH_SIZE, and sums totals across iterations', async () => {
      const { runDataRetentionCleanup } = await import(
        '@/lib/analytics/data-retention'
      );
      // First batch exhausts BATCH_SIZE (1000) -> loop continues; second batch
      // returns 250 (< 1000) -> loop halts. Total must be 1000 + 250 = 1250,
      // not just the first or last batch alone.
      executeQueueByTableName.set('click_events', [1000, 250]);

      const result = await runDataRetentionCleanup({ dryRun: false });

      expect(result.clickEventsDeleted).toBe(1250);

      const clickEventsExecuteCalls = mockExecute.mock.calls.filter(
        ([sqlChunk]) =>
          compile(sqlChunk as SQL).sql.match(
            /delete from "([a-z_]+)"/i
          )?.[1] === 'click_events'
      );
      expect(clickEventsExecuteCalls).toHaveLength(2);
    });

    it('targets the exact same WHERE condition text as the dry-run path for a representative rule (ingestionJobs)', async () => {
      const { runDataRetentionCleanup } = await import(
        '@/lib/analytics/data-retention'
      );
      executeQueueByTableName.set('ingestion_jobs', [7]);

      const result = await runDataRetentionCleanup({ dryRun: false });

      expect(result.ingestionJobsDeleted).toBe(7);

      const ingestionExecuteCall = mockExecute.mock.calls.find(
        ([sqlChunk]) =>
          compile(sqlChunk as SQL).sql.match(
            /delete from "([a-z_]+)"/i
          )?.[1] === 'ingestion_jobs'
      );
      expect(ingestionExecuteCall).toBeDefined();
      const compiled = compile(ingestionExecuteCall![0] as SQL);
      expect(compiled.sql).toContain('"ingestion_jobs"."status" in ($1, $2)');
      expect(compiled.sql).toContain('"ingestion_jobs"."created_at" <');
      const cutoff = expectedCutoff(FIXED_NOW, DEFAULT_RETENTION_DAYS);
      expect(compiled.params).toEqual([
        'succeeded',
        'failed',
        cutoff.toISOString(),
        1000, // BATCH_SIZE bound as the LIMIT param
      ]);
    });
  });

  describe('cross-rule failure behavior', () => {
    it('a single rule failing rejects the whole cleanup (Promise.all does NOT isolate per-rule failures)', async () => {
      const { runDataRetentionCleanup } = await import(
        '@/lib/analytics/data-retention'
      );
      executeQueueByTableName.set('chat_messages', []); // unused; failure below overrides
      mockExecute.mockImplementation((sqlChunk: SQL) => {
        const compiled = compile(sqlChunk);
        const match = compiled.sql.match(/delete from "([a-z_]+)"/i);
        if (match?.[1] === 'chat_messages') {
          return Promise.reject(new Error('transient db error'));
        }
        return Promise.resolve({ rowCount: 0 });
      });

      await expect(runDataRetentionCleanup({ dryRun: false })).rejects.toThrow(
        'transient db error'
      );
    });
  });

  describe('duration accounting', () => {
    it('computes duration as the elapsed Date.now() across the run, not a constant', async () => {
      const { runDataRetentionCleanup } = await import(
        '@/lib/analytics/data-retention'
      );
      let advanced = false;
      mockSelect.mockImplementation((_selection: unknown) => ({
        from: (table: PgTable) => ({
          where: (condition: SQL) => {
            selectCalls.push({ table, condition });
            if (table === emailSuppressions && !advanced) {
              advanced = true;
              vi.setSystemTime(new Date(FIXED_NOW.getTime() + 777));
            }
            return Promise.resolve([{ count: 0 }]);
          },
        }),
      }));

      const result = await runDataRetentionCleanup({ dryRun: true });

      expect(result.duration).toBe(777);
    });
  });
});
