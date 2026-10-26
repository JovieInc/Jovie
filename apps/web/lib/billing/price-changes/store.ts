/**
 * Persistence port for the notice pipeline. The Drizzle implementation lives in
 * drizzle-store.ts; memory-store.ts is the hermetic test double with identical
 * claim semantics.
 */

import type { NoticeRow, NoticeStatus, ScheduledPriceChange } from './types';

export type ChangeStatus =
  | 'scheduled'
  | 'notifying'
  | 'fully_notified'
  | 'held'
  | 'applied'
  | 'cancelled';

export interface ChangeState {
  readonly id: string;
  readonly status: ChangeStatus;
  readonly affectedCount: number;
  readonly scheduledAt: Date;
  readonly fullyNotifiedAt: Date | null;
  readonly heldAt: Date | null;
  readonly incidentFiledAt: Date | null;
  readonly appliedAt: Date | null;
}

export interface QueueTarget {
  readonly subscriptionId: string;
  readonly customerId: string;
  readonly userId: string | null;
}

export interface ChangePatch {
  readonly status?: ChangeStatus;
  readonly affectedCount?: number;
  readonly fullyNotifiedAt?: Date | null;
  readonly heldAt?: Date | null;
  readonly incidentFiledAt?: Date | null;
  readonly appliedAt?: Date | null;
}

export interface NoticeStore {
  /** Idempotent: first call inserts, later calls leave the row untouched. */
  ensureChange(change: ScheduledPriceChange, now: Date): Promise<ChangeState>;
  patchChange(changeId: string, patch: ChangePatch, now: Date): Promise<void>;
  listNotices(changeId: string): Promise<NoticeRow[]>;
  /** ON CONFLICT DO NOTHING on (change, subscription). Returns rows inserted. */
  queueNotices(
    changeId: string,
    targets: readonly QueueTarget[],
    now: Date
  ): Promise<number>;
  /**
   * Atomically moves ONE due row to `sending` and returns it, or null when
   * another worker holds it, it is not due, or it is already sent. Due means
   * queued, failed/bounced with nextAttemptAt <= now, or `sending` whose claim
   * is older than `staleBefore` (a crashed worker).
   */
  claimNotice(
    changeId: string,
    subscriptionId: string,
    now: Date,
    staleBefore: Date
  ): Promise<NoticeRow | null>;
  markSent(
    changeId: string,
    subscriptionId: string,
    detail: {
      providerMessageId: string;
      contentHash: string;
      templateVersion: string;
    },
    now: Date
  ): Promise<void>;
  markUnsent(
    changeId: string,
    subscriptionId: string,
    detail: {
      status: Extract<NoticeStatus, 'failed' | 'no_recipient'>;
      error: string;
      nextAttemptAt: Date | null;
    },
    now: Date
  ): Promise<void>;
  /** Webhook path: provider message id -> bounce. Returns true when a row matched. */
  recordBounce(
    providerMessageId: string,
    detail: { permanent: boolean; nextAttemptAt: Date | null },
    now: Date
  ): Promise<boolean>;
  recordFallbackNotice(
    changeId: string,
    subscriptionId: string,
    now: Date
  ): Promise<void>;
  markApplied(
    changeId: string,
    subscriptionId: string,
    stripePriceId: string,
    now: Date
  ): Promise<void>;
  markApplyError(
    changeId: string,
    subscriptionId: string,
    error: string
  ): Promise<void>;
  listAllChanges(): Promise<ChangeState[]>;
}
