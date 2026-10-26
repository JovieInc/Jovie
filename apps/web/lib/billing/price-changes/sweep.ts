/**
 * Price-change sweep: schedule -> notify -> gate -> switch, for every
 * registered change. Runs from the daily maintenance cron and is safe to run
 * any number of times: notices are unique per (change, subscription), claimed
 * with a conditional update, and sent with a provider idempotency key; the
 * Stripe switch carries its own idempotency key and is recorded per row.
 *
 * Real sending and real switching are separate switches (`sendEnabled`,
 * `applyEnabled`) that default OFF so development never emails a real person
 * or touches a live subscription.
 */

import { evaluateGate, isFullyNotified, validNoticeAt } from './gate';
import {
  type AffectedSubscription,
  type IncidentPort,
  type MailPort,
  type RecipientPort,
  type StripePort,
} from './ports';
import { isPriceIncrease, MS_PER_DAY, parseUtcDay } from './rules';
import type { NoticeStore } from './store';
import type { NoticeRow, ScheduledPriceChange } from './types';

/** A claimed row older than this is a crashed worker. Resend dedups by key for 24h. */
export const STALE_CLAIM_MS = 15 * 60 * 1000;
/** Resend remembers an idempotency key for 24h; past that a retry could double-send. */
export const PROVIDER_IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Retry delays after attempt 1..n. After the last one the row stays failed and blocks the gate. */
export const RETRY_DELAYS_MS = [
  60 * 60 * 1000,
  6 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
  48 * 60 * 60 * 1000,
] as const;

export interface BuildNoticeInput {
  readonly change: ScheduledPriceChange;
  readonly userName: string;
}

export interface BuiltNotice {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
  readonly contentHash: string;
  readonly templateVersion: string;
}

export interface SweepDeps {
  readonly store: NoticeStore;
  readonly stripe: StripePort;
  readonly recipients: RecipientPort;
  readonly mail: MailPort;
  readonly incidents: IncidentPort;
  readonly buildNotice: (input: BuildNoticeInput) => BuiltNotice;
  readonly now: () => Date;
  readonly sendEnabled: boolean;
  readonly applyEnabled: boolean;
}

export interface ChangeSweepResult {
  readonly changeId: string;
  readonly affected: number;
  readonly queued: number;
  readonly sent: number;
  readonly failed: number;
  readonly fullyNotified: boolean;
  readonly gate: 'not_due' | 'cancelled' | 'hold' | 'proceed' | 'skipped';
  readonly applied: number;
  readonly deferred: number;
  readonly wouldApply: number;
}

export function idempotencyKeyForNotice(
  changeId: string,
  subscriptionId: string,
  bounceRetries: number
): string {
  return `price-change:${changeId}:${subscriptionId}:b${bounceRetries}`;
}

function nextAttemptAfter(attempts: number, now: Date): Date | null {
  const delay = RETRY_DELAYS_MS[attempts - 1];
  return delay === undefined ? null : new Date(now.getTime() + delay);
}

async function sendOne(
  deps: SweepDeps,
  change: ScheduledPriceChange,
  subscription: AffectedSubscription,
  claimed: NoticeRow,
  now: Date
): Promise<'sent' | 'failed'> {
  const { store } = deps;
  const recipient = await deps.recipients.resolve(subscription);
  if (!recipient) {
    await store.markUnsent(
      change.id,
      subscription.subscriptionId,
      {
        status: 'no_recipient',
        error:
          'no deliverable email address on the user or the Stripe customer',
        nextAttemptAt: nextAttemptAfter(claimed.attempts, now),
      },
      now
    );
    return 'failed';
  }
  const built = deps.buildNotice({ change, userName: recipient.name });
  const result = await deps.mail
    .send({
      to: recipient.email,
      subject: built.subject,
      text: built.text,
      html: built.html,
      idempotencyKey: idempotencyKeyForNotice(
        change.id,
        subscription.subscriptionId,
        claimed.bounceRetries
      ),
    })
    .catch(
      (error: unknown) =>
        ({
          status: 'error',
          detail: error instanceof Error ? error.message : 'send threw',
        }) as const
    );
  if (result.status === 'sent' && result.messageId) {
    await store.markSent(
      change.id,
      subscription.subscriptionId,
      {
        providerMessageId: result.messageId,
        contentHash: built.contentHash,
        templateVersion: built.templateVersion,
      },
      now
    );
    return 'sent';
  }
  // `skipped` (provider disabled, suppressed address) is NOT a notice.
  await store.markUnsent(
    change.id,
    subscription.subscriptionId,
    {
      status: 'failed',
      error:
        result.status === 'sent'
          ? 'provider returned no message id'
          : `${result.status}: ${result.detail}`,
      nextAttemptAt: nextAttemptAfter(claimed.attempts, now),
    },
    now
  );
  return 'failed';
}

export async function sweepChange(
  deps: SweepDeps,
  change: ScheduledPriceChange
): Promise<ChangeSweepResult> {
  const { store } = deps;
  const now = deps.now();
  const base = {
    changeId: change.id,
    affected: 0,
    queued: 0,
    sent: 0,
    failed: 0,
    fullyNotified: false,
    gate: 'skipped' as ChangeSweepResult['gate'],
    applied: 0,
    deferred: 0,
    wouldApply: 0,
  };
  const state = await store.ensureChange(change, now);
  if (change.cancelledAt || state.status === 'cancelled') {
    return { ...base, gate: 'cancelled' };
  }
  if (state.status === 'applied')
    return { ...base, gate: 'proceed', fullyNotified: true };

  const scheduledAt = parseUtcDay(change.scheduledAt);
  if (!scheduledAt || now.getTime() < scheduledAt.getTime()) return base;

  const affected = await deps.stripe.listAffected(change);
  const bySubscription = new Map(
    affected.map(subscription => [subscription.subscriptionId, subscription])
  );
  let queued = 0;
  if (isPriceIncrease(change)) {
    const targets = await Promise.all(
      affected.map(async subscription => ({
        subscriptionId: subscription.subscriptionId,
        customerId: subscription.customerId,
        userId: (await deps.recipients.resolve(subscription))?.userId ?? null,
      }))
    );
    queued = await store.queueNotices(change.id, targets, now);
  }

  let sent = 0;
  let failed = 0;
  if (deps.sendEnabled && isPriceIncrease(change)) {
    const staleBefore = new Date(now.getTime() - STALE_CLAIM_MS);
    // A claim older than the provider's key window may already have been
    // delivered; a retry could double-send, so it fails closed for a human.
    for (const row of await store.listNotices(change.id)) {
      if (
        row.status === 'sending' &&
        row.claimedAt &&
        now.getTime() - row.claimedAt.getTime() > PROVIDER_IDEMPOTENCY_WINDOW_MS
      ) {
        await store.markUnsent(
          change.id,
          row.subscriptionId,
          {
            status: 'failed',
            error:
              'stale_claim_outside_idempotency_window: verify delivery before resending',
            nextAttemptAt: null,
          },
          now
        );
        failed += 1;
      }
    }
    for (const subscription of affected) {
      const claimed = await store.claimNotice(
        change.id,
        subscription.subscriptionId,
        now,
        staleBefore
      );
      if (!claimed) continue;
      const outcome = await sendOne(deps, change, subscription, claimed, now);
      if (outcome === 'sent') sent += 1;
      else failed += 1;
    }
  }

  const affectedIds = affected.map(subscription => subscription.subscriptionId);
  let notices = await store.listNotices(change.id);
  const fullyNotified = isFullyNotified({
    change,
    affectedSubscriptionIds: affectedIds,
    notices,
  });
  await store.patchChange(
    change.id,
    {
      affectedCount: affected.length,
      status: fullyNotified ? 'fully_notified' : 'notifying',
      fullyNotifiedAt:
        fullyNotified && !state.fullyNotifiedAt && affected.length > 0
          ? now
          : state.fullyNotifiedAt,
    },
    now
  );

  const decision = evaluateGate({
    change,
    now,
    affectedSubscriptionIds: affectedIds,
    notices,
  });
  const result = {
    ...base,
    affected: affected.length,
    queued,
    sent,
    failed,
    fullyNotified,
  };
  if (decision.kind === 'not_due' || decision.kind === 'cancelled') {
    return { ...result, gate: decision.kind };
  }

  if (decision.kind === 'hold') {
    await store.patchChange(
      change.id,
      { status: 'held', heldAt: state.heldAt ?? now },
      now
    );
    if (!state.incidentFiledAt) {
      await deps.incidents.raise({
        changeId: change.id,
        summary: `Price change ${change.id} is held: ${decision.missing.length} subscriber(s) have no valid notice`,
        missing: decision.missing,
        reasons: decision.reasons,
      });
      await store.patchChange(change.id, { incidentFiledAt: now }, now);
    }
    return { ...result, gate: 'hold' };
  }

  // proceed: any earlier hold is resolved; switch each ready subscription,
  // one at a time, recorded per row.
  if (state.heldAt || state.incidentFiledAt) {
    await store.patchChange(
      change.id,
      { heldAt: null, incidentFiledAt: null },
      now
    );
  }
  let applied = 0;
  let wouldApply = 0;
  const newlyBlocked: string[] = [];
  const alreadyErrored = new Set(
    notices.filter(row => row.applyError).map(row => row.subscriptionId)
  );
  for (const subscriptionId of decision.ready) {
    const subscription = bySubscription.get(subscriptionId);
    if (!subscription) continue;
    if (!deps.applyEnabled) {
      wouldApply += 1;
      continue;
    }
    try {
      const { stripePriceId } = await deps.stripe.switchPrice(
        change,
        subscription,
        `price-change-apply:${change.id}:${subscriptionId}`
      );
      await store.markApplied(change.id, subscriptionId, stripePriceId, now);
      applied += 1;
    } catch (error) {
      if (!alreadyErrored.has(subscriptionId))
        newlyBlocked.push(subscriptionId);
      await store.markApplyError(
        change.id,
        subscriptionId,
        error instanceof Error ? error.message : 'switch failed'
      );
    }
  }
  notices = await store.listNotices(change.id);
  const stillOnOld = decision.ready.length + decision.deferred.length - applied;
  if (newlyBlocked.length > 0) {
    await deps.incidents.raise({
      changeId: change.id,
      summary: `Price change ${change.id}: ${newlyBlocked.length} subscription(s) could not be switched and need a manual look`,
      missing: newlyBlocked,
      reasons: Object.fromEntries(
        notices
          .filter(row => newlyBlocked.includes(row.subscriptionId))
          .map(row => [row.subscriptionId, row.applyError ?? 'switch failed'])
      ),
    });
    await store.patchChange(change.id, { incidentFiledAt: now }, now);
  }
  if (deps.applyEnabled && stillOnOld === 0 && affected.length > 0) {
    await store.patchChange(
      change.id,
      { status: 'applied', appliedAt: now },
      now
    );
  }
  return {
    ...result,
    gate: 'proceed',
    applied,
    deferred: decision.deferred.length,
    wouldApply,
  };
}

export async function runPriceChangeSweep(
  deps: SweepDeps,
  changes: readonly ScheduledPriceChange[]
): Promise<ChangeSweepResult[]> {
  const results: ChangeSweepResult[] = [];
  for (const change of changes) {
    results.push(await sweepChange(deps, change));
  }
  return results;
}

/** Re-exported for tests that assert a notice's validity the same way the gate does. */
export { MS_PER_DAY, validNoticeAt };
