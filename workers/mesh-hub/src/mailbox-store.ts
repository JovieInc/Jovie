/**
 * New mailbox surface (notice TTL, coalesced DLQ, admin peek and bulk-ack).
 * The durable store and its pre-existing methods stay in core.ts.
 */
import { MailboxStore as CoreMailbox } from './core.ts';
import type { MailboxSelector } from './envelope-policy.ts';
import {
  bulkAck as bulkAckMessages,
  clearDlqSummary as clearStoredDlqSummary,
  peek as peekMessages,
  recordDlqDead as recordStoredDlqDead,
  dlqPending as storedDlqPending,
  pendingDlqSummary as storedDlqSummary,
  sweepExpired as sweepExpiredMessages,
} from './mailbox-admin.ts';

export class MailboxStore extends CoreMailbox {
  sweepExpired(now: number, ttlMs: number) {
    return sweepExpiredMessages(this.sql, now, ttlMs);
  }

  recordDlqDead(
    target: string,
    fallback: string,
    seq: number,
    now: number,
    windowMs: number
  ): void {
    recordStoredDlqDead(this, target, fallback, seq, now, windowMs);
  }

  pendingDlqSummary(
    target: string,
    fallback: string,
    now: number,
    windowMs: number
  ) {
    return storedDlqSummary(this, target, fallback, now, windowMs);
  }

  clearDlqSummary(target: string, fallback: string): void {
    clearStoredDlqSummary(this, target, fallback);
  }

  dlqPending(target: string): boolean {
    return storedDlqPending(this.sql, target);
  }

  peek(selector: MailboxSelector, now: number) {
    return peekMessages(this.sql, selector, now);
  }

  bulkAck(selector: MailboxSelector, maxIds: number, now: number) {
    return bulkAckMessages(
      this.sql,
      (ids, at, reason) => this.ack(ids, at, reason),
      selector,
      maxIds,
      now
    );
  }
}
