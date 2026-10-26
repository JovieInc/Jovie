import 'server-only';

import { and, asc, sql as drizzleSql, eq, inArray, lte, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  priceChangeNotices,
  scheduledPriceChanges,
} from '@/lib/db/schema/price-changes';
import { parseUtcDay } from './rules';
import type {
  ChangePatch,
  ChangeState,
  ChangeStatus,
  NoticeStore,
  QueueTarget,
} from './store';
import type { NoticeRow, NoticeStatus, ScheduledPriceChange } from './types';

type NoticeDbRow = typeof priceChangeNotices.$inferSelect;
type ChangeDbRow = typeof scheduledPriceChanges.$inferSelect;

function toNotice(row: NoticeDbRow): NoticeRow {
  return {
    changeId: row.changeId,
    subscriptionId: row.subscriptionId,
    customerId: row.customerId,
    userId: row.userId,
    status: row.status as NoticeStatus,
    attempts: row.attempts,
    bounceRetries: row.bounceRetries,
    nextAttemptAt: row.nextAttemptAt,
    providerMessageId: row.providerMessageId,
    contentHash: row.contentHash,
    templateVersion: row.templateVersion,
    queuedAt: row.queuedAt,
    claimedAt: row.claimedAt,
    sentAt: row.sentAt,
    lastError: row.lastError,
    fallbackNoticeAt: row.fallbackNoticeAt,
    appliedAt: row.appliedAt,
    appliedStripePriceId: row.appliedStripePriceId,
    applyError: row.applyError,
  };
}

function toState(row: ChangeDbRow): ChangeState {
  return {
    id: row.id,
    status: row.status as ChangeStatus,
    affectedCount: row.affectedCount,
    scheduledAt: row.scheduledAt,
    fullyNotifiedAt: row.fullyNotifiedAt,
    heldAt: row.heldAt,
    incidentFiledAt: row.incidentFiledAt,
    appliedAt: row.appliedAt,
  };
}

export class DrizzleNoticeStore implements NoticeStore {
  async ensureChange(
    change: ScheduledPriceChange,
    now: Date
  ): Promise<ChangeState> {
    const effectiveAt = parseUtcDay(change.effectiveDate);
    const scheduledAt = parseUtcDay(change.scheduledAt);
    if (!effectiveAt || !scheduledAt) {
      throw new Error(`price change ${change.id} has an invalid date`);
    }
    await db
      .insert(scheduledPriceChanges)
      .values({
        id: change.id,
        priceKey: change.priceKey,
        planName: change.planName,
        oldAmountCents: change.oldAmountCents,
        newAmountCents: change.newAmountCents,
        effectiveAt,
        scheduledAt,
        registeredAt: now,
        status: change.cancelledAt ? 'cancelled' : 'scheduled',
      })
      .onConflictDoNothing();
    const [row] = await db
      .select()
      .from(scheduledPriceChanges)
      .where(eq(scheduledPriceChanges.id, change.id))
      .limit(1);
    if (!row) throw new Error(`price change ${change.id} not persisted`);
    if (
      change.cancelledAt &&
      row.status !== 'cancelled' &&
      row.status !== 'applied'
    ) {
      await this.patchChange(change.id, { status: 'cancelled' }, now);
      return { ...toState(row), status: 'cancelled' };
    }
    return toState(row);
  }

  async patchChange(
    changeId: string,
    patch: ChangePatch,
    now: Date
  ): Promise<void> {
    await db
      .update(scheduledPriceChanges)
      .set({ ...patch, lastSweepAt: now })
      .where(eq(scheduledPriceChanges.id, changeId));
  }

  async listNotices(changeId: string): Promise<NoticeRow[]> {
    const rows = await db
      .select()
      .from(priceChangeNotices)
      .where(eq(priceChangeNotices.changeId, changeId))
      .orderBy(asc(priceChangeNotices.queuedAt));
    return rows.map(toNotice);
  }

  async queueNotices(
    changeId: string,
    targets: readonly QueueTarget[],
    now: Date
  ): Promise<number> {
    if (targets.length === 0) return 0;
    const inserted = await db
      .insert(priceChangeNotices)
      .values(
        targets.map(target => ({
          changeId,
          subscriptionId: target.subscriptionId,
          customerId: target.customerId,
          userId: target.userId,
          queuedAt: now,
        }))
      )
      .onConflictDoNothing({
        target: [
          priceChangeNotices.changeId,
          priceChangeNotices.subscriptionId,
        ],
      })
      .returning({ id: priceChangeNotices.id });
    return inserted.length;
  }

  async claimNotice(
    changeId: string,
    subscriptionId: string,
    now: Date,
    staleBefore: Date
  ): Promise<NoticeRow | null> {
    // One conditional UPDATE is the claim: two workers cannot both match.
    const [row] = await db
      .update(priceChangeNotices)
      .set({
        status: 'sending',
        attempts: drizzleSql`${priceChangeNotices.attempts} + 1`,
        claimedAt: now,
      })
      .where(
        and(
          eq(priceChangeNotices.changeId, changeId),
          eq(priceChangeNotices.subscriptionId, subscriptionId),
          or(
            eq(priceChangeNotices.status, 'queued'),
            and(
              inArray(priceChangeNotices.status, ['failed', 'bounced']),
              lte(priceChangeNotices.nextAttemptAt, now)
            ),
            and(
              eq(priceChangeNotices.status, 'sending'),
              lte(priceChangeNotices.claimedAt, staleBefore)
            )
          )
        )
      )
      .returning();
    return row ? toNotice(row) : null;
  }

  async markSent(
    changeId: string,
    subscriptionId: string,
    detail: {
      providerMessageId: string;
      contentHash: string;
      templateVersion: string;
    },
    now: Date
  ): Promise<void> {
    await db
      .update(priceChangeNotices)
      .set({
        status: 'sent',
        sentAt: now,
        providerMessageId: detail.providerMessageId,
        contentHash: detail.contentHash,
        templateVersion: detail.templateVersion,
        lastError: null,
        nextAttemptAt: null,
      })
      .where(this.rowWhere(changeId, subscriptionId));
  }

  async markUnsent(
    changeId: string,
    subscriptionId: string,
    detail: {
      status: 'failed' | 'no_recipient';
      error: string;
      nextAttemptAt: Date | null;
    }
  ): Promise<void> {
    await db
      .update(priceChangeNotices)
      .set({
        status: detail.status,
        lastError: detail.error.slice(0, 500),
        nextAttemptAt: detail.nextAttemptAt,
      })
      .where(this.rowWhere(changeId, subscriptionId));
  }

  async recordBounce(
    providerMessageId: string,
    detail: { permanent: boolean; nextAttemptAt: Date | null }
  ): Promise<boolean> {
    const updated = await db
      .update(priceChangeNotices)
      .set(
        detail.permanent
          ? {
              status: 'permanent_bounce',
              nextAttemptAt: null,
              lastError: 'permanent_bounce',
            }
          : {
              status: 'bounced',
              bounceRetries: drizzleSql`${priceChangeNotices.bounceRetries} + 1`,
              nextAttemptAt: detail.nextAttemptAt,
              lastError: 'soft_bounce',
            }
      )
      .where(eq(priceChangeNotices.providerMessageId, providerMessageId))
      .returning({ id: priceChangeNotices.id });
    return updated.length > 0;
  }

  async recordFallbackNotice(
    changeId: string,
    subscriptionId: string,
    now: Date
  ): Promise<void> {
    await db
      .update(priceChangeNotices)
      .set({ fallbackNoticeAt: now })
      .where(this.rowWhere(changeId, subscriptionId));
  }

  async markApplied(
    changeId: string,
    subscriptionId: string,
    stripePriceId: string,
    now: Date
  ): Promise<void> {
    await db
      .update(priceChangeNotices)
      .set({
        appliedAt: now,
        appliedStripePriceId: stripePriceId,
        applyError: null,
      })
      .where(this.rowWhere(changeId, subscriptionId));
  }

  async markApplyError(
    changeId: string,
    subscriptionId: string,
    error: string
  ): Promise<void> {
    await db
      .update(priceChangeNotices)
      .set({ applyError: error.slice(0, 500) })
      .where(this.rowWhere(changeId, subscriptionId));
  }

  async listAllChanges(): Promise<ChangeState[]> {
    const rows = await db.select().from(scheduledPriceChanges);
    return rows.map(toState);
  }

  private rowWhere(changeId: string, subscriptionId: string) {
    return and(
      eq(priceChangeNotices.changeId, changeId),
      eq(priceChangeNotices.subscriptionId, subscriptionId)
    );
  }
}
