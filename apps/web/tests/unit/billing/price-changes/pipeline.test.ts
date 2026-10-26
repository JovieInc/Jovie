import { describe, expect, it, vi } from 'vitest';
import { evaluateGate } from '@/lib/billing/price-changes/gate';
import { MemoryNoticeStore } from '@/lib/billing/price-changes/memory-store';
import { summarizePriceChangeNotices } from '@/lib/billing/price-changes/metrics';
import {
  type AffectedSubscription,
  type MailPort,
  type MailResult,
  ScheduleOwnedError,
  type StripePort,
} from '@/lib/billing/price-changes/ports';
import { PRICE_CHANGE_NOTICE_DAYS } from '@/lib/billing/price-changes/rules';
import {
  runPriceChangeSweep,
  type SweepDeps,
  sweepChange,
} from '@/lib/billing/price-changes/sweep';
import type { ScheduledPriceChange } from '@/lib/billing/price-changes/types';

const CHANGE: ScheduledPriceChange = {
  id: 'pro-month-12-to-15',
  priceKey: 'offer:pro:month',
  planName: 'Artist Presence',
  interval: 'month',
  currency: 'usd',
  oldAmountCents: 1200,
  newAmountCents: 1500,
  oldStripePriceEnvKey: 'STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY',
  newStripePriceEnvKey: 'STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY_V2',
  effectiveDate: '2027-01-15',
  scheduledAt: '2026-12-01',
  reason: 'Costs',
};

const DAY = 86_400_000;
const at = (iso: string) => new Date(iso);

function sub(
  id: string,
  extra: Partial<AffectedSubscription> = {}
): AffectedSubscription {
  return {
    subscriptionId: id,
    customerId: `cus_${id}`,
    customerEmail: `${id}@example.test`,
    status: 'active',
    itemId: `si_${id}`,
    hasSchedule: false,
    ...extra,
  };
}

function harness(
  initial: AffectedSubscription[],
  opts: Partial<SweepDeps> = {}
) {
  let clock = at('2026-12-01T09:00:00.000Z');
  const subs = [...initial];
  const store = new MemoryNoticeStore();
  const sentMessages: Array<{ to: string; key: string }> = [];
  const switched: string[] = [];
  const incidents: Array<{ changeId: string; missing: readonly string[] }> = [];
  let messageSeq = 0;
  const behavior: { mail: (to: string) => MailResult | 'throw' } = {
    mail: () => ({ status: 'sent', messageId: `msg_${++messageSeq}` }),
  };
  const mail: MailPort = {
    async send(message) {
      const outcome = behavior.mail(message.to);
      if (outcome === 'throw') throw new Error('network');
      if (outcome.status === 'sent') {
        // Resend dedups on the idempotency key.
        if (!sentMessages.some(m => m.key === message.idempotencyKey)) {
          sentMessages.push({ to: message.to, key: message.idempotencyKey });
        }
      }
      return outcome;
    },
  };
  const stripe: StripePort = {
    listAffected: async () =>
      subs.filter(s => !switched.includes(s.subscriptionId)),
    switchPrice: async (_change, subscription) => {
      if (subscription.hasSchedule)
        throw new ScheduleOwnedError(subscription.subscriptionId);
      switched.push(subscription.subscriptionId);
      return { stripePriceId: 'price_new' };
    },
  };
  const deps: SweepDeps = {
    store,
    stripe,
    recipients: {
      resolve: async s =>
        s.customerEmail
          ? { userId: null, email: s.customerEmail, name: 'Sam' }
          : null,
    },
    mail,
    incidents: { raise: async i => void incidents.push(i) },
    buildNotice: ({ change }) => ({
      subject: `s ${change.id}`,
      text: 't',
      html: 'h',
      contentHash: 'hash',
      templateVersion: 'v-test',
    }),
    now: () => clock,
    sendEnabled: true,
    applyEnabled: true,
    ...opts,
  };
  return {
    deps,
    store,
    subs,
    sentMessages,
    switched,
    incidents,
    behavior,
    setNow: (iso: string) => {
      clock = at(iso);
    },
    sweep: () => sweepChange(deps, CHANGE),
  };
}

describe('price change pipeline', () => {
  it('schedule -> notify -> switch on a fixture', async () => {
    const h = harness([sub('a'), sub('b')]);
    const first = await h.sweep();
    expect(first).toMatchObject({
      affected: 2,
      queued: 2,
      sent: 2,
      fullyNotified: true,
      gate: 'not_due',
    });
    expect(h.switched).toEqual([]);

    h.setNow('2027-01-15T00:30:00.000Z');
    const effective = await h.sweep();
    expect(effective).toMatchObject({ gate: 'proceed', applied: 2 });
    expect(h.switched.sort()).toEqual(['a', 'b']);
    const state = h.store.changes.get(CHANGE.id);
    expect(state?.status).toBe('applied');
    expect(state?.fullyNotifiedAt?.toISOString()).toBe(
      '2026-12-01T09:00:00.000Z'
    );
  });

  it('a missing notice blocks the switch for everyone and raises one incident', async () => {
    const h = harness([sub('a'), sub('b')]);
    h.behavior.mail = to =>
      to.startsWith('b')
        ? { status: 'error', detail: 'resend 500' }
        : { status: 'sent', messageId: 'm_a' };
    await h.sweep();
    h.setNow('2027-01-15T01:00:00.000Z');
    const held = await h.sweep();
    expect(held.gate).toBe('hold');
    expect(h.switched).toEqual([]);
    expect(h.incidents).toHaveLength(1);
    expect(h.incidents[0]?.missing).toEqual(['b']);
    await h.sweep();
    expect(h.incidents).toHaveLength(1); // incident raised once
    expect(h.store.changes.get(CHANGE.id)?.status).toBe('held');
  });

  it('a hold clears and the switch proceeds once the notice lands', async () => {
    const h = harness([sub('a')]);
    h.behavior.mail = () => ({ status: 'error', detail: 'down' });
    await h.sweep();
    h.setNow('2027-01-15T01:00:00.000Z');
    expect((await h.sweep()).gate).toBe('hold');
    h.behavior.mail = () => ({ status: 'sent', messageId: 'm1' });
    h.setNow('2027-01-16T01:00:00.000Z');
    const recovered = await h.sweep();
    // Notice just sent: the switch is deferred until sentAt + N days.
    expect(recovered).toMatchObject({
      gate: 'proceed',
      applied: 0,
      deferred: 1,
    });
    expect(h.switched).toEqual([]);
    h.setNow(
      new Date(
        at('2027-01-16T01:00:00.000Z').getTime() +
          PRICE_CHANGE_NOTICE_DAYS * DAY
      ).toISOString()
    );
    expect(await h.sweep()).toMatchObject({ applied: 1 });
  });

  it('never double-sends: repeated sweeps and concurrent claims send once', async () => {
    const h = harness([sub('a')]);
    await Promise.all([h.sweep(), h.sweep(), h.sweep()]);
    await h.sweep();
    expect(h.sentMessages).toHaveLength(1);
    const rows = await h.store.listNotices(CHANGE.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.attempts).toBe(1);
  });

  it('a skipped send (provider off, suppressed address) is not a notice', async () => {
    const h = harness([sub('a')]);
    h.behavior.mail = () => ({
      status: 'skipped',
      detail: 'RESEND_API_KEY not configured',
    });
    await h.sweep();
    const row = (await h.store.listNotices(CHANGE.id))[0];
    expect(row?.status).toBe('failed');
    h.setNow('2027-01-15T01:00:00.000Z');
    expect((await h.sweep()).gate).toBe('hold');
    expect(h.switched).toEqual([]);
  });

  it('retries a failed send after the backoff, with the same idempotency key', async () => {
    const h = harness([sub('a')]);
    h.behavior.mail = () => 'throw';
    await h.sweep();
    expect((await h.store.listNotices(CHANGE.id))[0]?.status).toBe('failed');
    h.behavior.mail = () => ({ status: 'sent', messageId: 'm2' });
    await h.sweep(); // backoff not elapsed
    expect(h.sentMessages).toHaveLength(0);
    h.setNow('2026-12-01T10:30:00.000Z');
    await h.sweep();
    expect(h.sentMessages).toHaveLength(1);
    expect(h.sentMessages[0]?.key).toBe(`price-change:${CHANGE.id}:a:b0`);
  });

  it('a hard bounce un-notifies the subscriber and holds the switch', async () => {
    const h = harness([sub('a')]);
    await h.sweep();
    const [row] = await h.store.listNotices(CHANGE.id);
    await h.store.recordBounce(
      row?.providerMessageId ?? '',
      { permanent: true, nextAttemptAt: null },
      h.deps.now()
    );
    h.setNow('2027-01-15T01:00:00.000Z');
    expect((await h.sweep()).gate).toBe('hold');
    expect(h.switched).toEqual([]);
  });

  it('a documented permanent bounce (alternate-channel notice) lets the switch through', async () => {
    const h = harness([sub('a')]);
    await h.sweep();
    const [row] = await h.store.listNotices(CHANGE.id);
    await h.store.recordBounce(
      row?.providerMessageId ?? '',
      { permanent: true, nextAttemptAt: null },
      h.deps.now()
    );
    await h.store.recordFallbackNotice(
      CHANGE.id,
      'a',
      at('2026-12-02T00:00:00.000Z')
    );
    h.setNow('2027-01-15T01:00:00.000Z');
    expect(await h.sweep()).toMatchObject({ gate: 'proceed', applied: 1 });
  });

  it('a soft bounce retries with a new idempotency key', async () => {
    const h = harness([sub('a')]);
    await h.sweep();
    const [row] = await h.store.listNotices(CHANGE.id);
    await h.store.recordBounce(
      row?.providerMessageId ?? '',
      { permanent: false, nextAttemptAt: at('2026-12-02T09:00:00.000Z') },
      h.deps.now()
    );
    h.setNow('2026-12-02T10:00:00.000Z');
    await h.sweep();
    expect(h.sentMessages.map(m => m.key)).toEqual([
      `price-change:${CHANGE.id}:a:b0`,
      `price-change:${CHANGE.id}:a:b1`,
    ]);
  });

  it('a subscriber with no address blocks the switch instead of being skipped', async () => {
    const h = harness([sub('a', { customerEmail: null })]);
    await h.sweep();
    expect((await h.store.listNotices(CHANGE.id))[0]?.status).toBe(
      'no_recipient'
    );
    h.setNow('2027-01-15T01:00:00.000Z');
    expect((await h.sweep()).gate).toBe('hold');
  });

  it('a late joiner is notified on the next sweep and switched N days after its notice', async () => {
    const h = harness([sub('a')]);
    await h.sweep();
    h.setNow('2027-01-10T00:00:00.000Z');
    h.subs.push(sub('late'));
    await h.sweep();
    h.setNow('2027-01-15T01:00:00.000Z');
    const result = await h.sweep();
    expect(result).toMatchObject({ gate: 'proceed', applied: 1, deferred: 1 });
    expect(h.switched).toEqual(['a']);
    h.setNow('2027-02-10T00:00:00.000Z');
    await h.sweep();
    expect(h.switched.sort()).toEqual(['a', 'late']);
  });

  it('a Stripe schedule that owns the subscription is raised, not overwritten', async () => {
    const h = harness([sub('a', { hasSchedule: true })]);
    await h.sweep();
    h.setNow('2027-01-15T01:00:00.000Z');
    const result = await h.sweep();
    expect(result.applied).toBe(0);
    expect(h.switched).toEqual([]);
    expect(h.incidents).toHaveLength(1);
    await h.sweep();
    expect(h.incidents).toHaveLength(1);
  });

  it('sending and switching are off by default switches: nothing real happens', async () => {
    const off = harness([sub('a')], {
      sendEnabled: false,
      applyEnabled: false,
    });
    await off.sweep();
    expect(off.sentMessages).toHaveLength(0);
    const dry = harness([sub('a')], { applyEnabled: false });
    await dry.sweep();
    dry.setNow('2027-02-20T00:00:00.000Z');
    expect(await dry.sweep()).toMatchObject({
      gate: 'proceed',
      applied: 0,
      wouldApply: 1,
    });
    expect(dry.switched).toEqual([]);
  });

  it('price decreases need no notice and are never held', async () => {
    const decrease = {
      ...CHANGE,
      id: 'drop',
      oldAmountCents: 1500,
      newAmountCents: 1200,
    };
    const h = harness([sub('a')]);
    h.behavior.mail = () => 'throw';
    h.setNow('2027-01-16T00:00:00.000Z');
    const result = await sweepChange(h.deps, decrease);
    expect(result).toMatchObject({ gate: 'proceed', applied: 1 });
  });

  it('does nothing for a cancelled change and before its scheduling day', async () => {
    const cancelled = harness([sub('a')]);
    expect(
      (
        await sweepChange(cancelled.deps, {
          ...CHANGE,
          cancelledAt: '2026-12-05',
        })
      ).gate
    ).toBe('cancelled');
    const h = harness([sub('a')]);
    h.setNow('2026-11-01T00:00:00.000Z');
    expect(await h.sweep()).toMatchObject({ affected: 0, gate: 'skipped' });
  });

  it('measures scheduled, sent, failed and time to fully notified', async () => {
    const h = harness([sub('a'), sub('b')]);
    h.behavior.mail = to =>
      to.startsWith('b')
        ? { status: 'error', detail: 'x' }
        : { status: 'sent', messageId: 'm' };
    await h.sweep();
    let metrics = summarizePriceChangeNotices(
      await h.store.listAllChanges(),
      await h.store.listNotices(CHANGE.id)
    );
    expect(metrics).toMatchObject({
      scheduled: 2,
      sent: 1,
      failed: 1,
      pending: 0,
    });
    expect(metrics.timeToFullyNotifiedSeconds).toEqual([]);
    h.behavior.mail = () => ({ status: 'sent', messageId: 'm3' });
    h.setNow('2026-12-02T10:00:00.000Z');
    await h.sweep();
    metrics = summarizePriceChangeNotices(
      await h.store.listAllChanges(),
      await h.store.listNotices(CHANGE.id)
    );
    expect(metrics.sent).toBe(2);
    expect(metrics.p50TimeToFullyNotifiedSeconds).toBe(34 * 3600);
  });

  it('gate is pure: not due before the effective date', () => {
    expect(
      evaluateGate({
        change: CHANGE,
        now: at('2027-01-14T23:59:59.000Z'),
        affectedSubscriptionIds: ['a'],
        notices: [],
      })
    ).toEqual({ kind: 'not_due' });
  });

  it('runPriceChangeSweep covers every registered change', async () => {
    const h = harness([sub('a')]);
    const spy = vi.spyOn(h.deps.stripe, 'listAffected');
    const results = await runPriceChangeSweep(h.deps, [
      CHANGE,
      { ...CHANGE, id: 'other-change' },
    ]);
    expect(results).toHaveLength(2);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
