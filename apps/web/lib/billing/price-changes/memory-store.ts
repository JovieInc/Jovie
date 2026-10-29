import type {
  ChangePatch,
  ChangeState,
  NoticeStore,
  QueueTarget,
} from './store';
import type { NoticeRow, ScheduledPriceChange } from './types';

/** Hermetic NoticeStore with the same claim semantics as the Drizzle store. */
export class MemoryNoticeStore implements NoticeStore {
  readonly changes = new Map<string, ChangeState>();
  readonly notices = new Map<string, NoticeRow>();

  private key(changeId: string, subscriptionId: string): string {
    return JSON.stringify([changeId, subscriptionId]);
  }

  private patchNotice(
    changeId: string,
    subscriptionId: string,
    patch: Partial<NoticeRow>
  ): void {
    const key = this.key(changeId, subscriptionId);
    const row = this.notices.get(key);
    if (row) this.notices.set(key, { ...row, ...patch });
  }

  async ensureChange(
    change: ScheduledPriceChange,
    _now: Date
  ): Promise<ChangeState> {
    const existing = this.changes.get(change.id);
    if (existing) return existing;
    const state: ChangeState = {
      id: change.id,
      status: change.cancelledAt ? 'cancelled' : 'scheduled',
      affectedCount: 0,
      scheduledAt: new Date(`${change.scheduledAt}T00:00:00.000Z`),
      fullyNotifiedAt: null,
      heldAt: null,
      incidentFiledAt: null,
      appliedAt: null,
    };
    this.changes.set(change.id, state);
    return state;
  }

  async patchChange(changeId: string, patch: ChangePatch): Promise<void> {
    const state = this.changes.get(changeId);
    if (state) this.changes.set(changeId, { ...state, ...patch });
  }

  async listNotices(changeId: string): Promise<NoticeRow[]> {
    return [...this.notices.values()].filter(row => row.changeId === changeId);
  }

  async queueNotices(
    changeId: string,
    targets: readonly QueueTarget[],
    now: Date
  ): Promise<number> {
    let inserted = 0;
    for (const target of targets) {
      const key = this.key(changeId, target.subscriptionId);
      if (this.notices.has(key)) continue;
      this.notices.set(key, {
        changeId,
        subscriptionId: target.subscriptionId,
        customerId: target.customerId,
        userId: target.userId,
        status: 'queued',
        attempts: 0,
        bounceRetries: 0,
        nextAttemptAt: null,
        providerMessageId: null,
        contentHash: null,
        templateVersion: null,
        queuedAt: now,
        claimedAt: null,
        sentAt: null,
        lastError: null,
        fallbackNoticeAt: null,
        appliedAt: null,
        appliedStripePriceId: null,
        applyError: null,
      });
      inserted += 1;
    }
    return inserted;
  }

  async claimNotice(
    changeId: string,
    subscriptionId: string,
    now: Date,
    staleBefore: Date
  ): Promise<NoticeRow | null> {
    const key = this.key(changeId, subscriptionId);
    const row = this.notices.get(key);
    if (!row) return null;
    const retryDue =
      (row.status === 'failed' || row.status === 'bounced') &&
      row.nextAttemptAt !== null &&
      row.nextAttemptAt <= now;
    const staleSending =
      row.status === 'sending' &&
      row.claimedAt !== null &&
      row.claimedAt < staleBefore;
    if (row.status !== 'queued' && !retryDue && !staleSending) return null;
    const claimed: NoticeRow = {
      ...row,
      status: 'sending',
      attempts: row.attempts + 1,
      claimedAt: now,
    };
    this.notices.set(key, claimed);
    return claimed;
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
    this.patchNotice(changeId, subscriptionId, {
      status: 'sent',
      sentAt: now,
      providerMessageId: detail.providerMessageId,
      contentHash: detail.contentHash,
      templateVersion: detail.templateVersion,
      lastError: null,
      nextAttemptAt: null,
    });
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
    this.patchNotice(changeId, subscriptionId, {
      status: detail.status,
      lastError: detail.error,
      nextAttemptAt: detail.nextAttemptAt,
    });
  }

  async recordBounce(
    providerMessageId: string,
    detail: { permanent: boolean; nextAttemptAt: Date | null }
  ): Promise<boolean> {
    for (const [key, row] of this.notices) {
      if (row.providerMessageId !== providerMessageId) continue;
      this.notices.set(key, {
        ...row,
        status: detail.permanent ? 'permanent_bounce' : 'bounced',
        bounceRetries: detail.permanent
          ? row.bounceRetries
          : row.bounceRetries + 1,
        nextAttemptAt: detail.permanent ? null : detail.nextAttemptAt,
        lastError: detail.permanent ? 'permanent_bounce' : 'soft_bounce',
      });
      return true;
    }
    return false;
  }

  async recordFallbackNotice(
    changeId: string,
    subscriptionId: string,
    now: Date
  ): Promise<void> {
    this.patchNotice(changeId, subscriptionId, { fallbackNoticeAt: now });
  }

  async markApplied(
    changeId: string,
    subscriptionId: string,
    stripePriceId: string,
    now: Date
  ): Promise<void> {
    this.patchNotice(changeId, subscriptionId, {
      appliedAt: now,
      appliedStripePriceId: stripePriceId,
      applyError: null,
    });
  }

  async markApplyError(
    changeId: string,
    subscriptionId: string,
    error: string
  ): Promise<void> {
    this.patchNotice(changeId, subscriptionId, { applyError: error });
  }

  async listAllChanges(): Promise<ChangeState[]> {
    return [...this.changes.values()];
  }
}
