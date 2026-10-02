import { describe, expect, it } from 'vitest';
import {
  balanceDrift,
  balanceWithinTolerance,
  isLedgerEffective,
  type LedgerEntry,
  minorUnitsToDecimal,
  normalizeProviderTransaction,
  type ProviderTransaction,
  reconcileLedger,
  toMinorUnits,
  transactionDedupeKey,
} from '@/lib/finance/ledger';

const DAY = 86_400_000;
const d = (day: number) => new Date(day * DAY).toISOString();

function txn(partial: Partial<ProviderTransaction>): ProviderTransaction {
  return {
    providerTransactionId: 'pt_1',
    providerAccountId: 'pa_1',
    amount: -10,
    currency: 'USD',
    occurredAt: d(10),
    pending: false,
    ...partial,
  };
}

function entry(partial: Partial<LedgerEntry>): LedgerEntry {
  return {
    id: 'e1',
    dedupeKey: 'k1',
    providerTransactionId: 'p1',
    accountKey: 'acct-a',
    accountKind: 'depository',
    amountMinor: -1000,
    occurredDay: 10,
    textNorm: 'coffee shop',
    status: 'posted',
    flowKind: 'unclassified',
    matchedTransactionId: null,
    supersededById: null,
    ...partial,
  };
}

const byId = (muts: ReturnType<typeof reconcileLedger>) =>
  new Map(muts.map(m => [m.id, m]));

describe('ledger normalization (JOV-4612)', () => {
  it('derives a stable dedupe key from the provider transaction id', () => {
    const a = transactionDedupeKey(txn({ providerTransactionId: 'pt_x' }));
    const b = transactionDedupeKey(txn({ providerTransactionId: 'pt_x' }));
    const c = transactionDedupeKey(txn({ providerTransactionId: 'pt_y' }));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('falls back to a content fingerprint when the provider omits an id', () => {
    const a = transactionDedupeKey(txn({ providerTransactionId: null }));
    const b = transactionDedupeKey(
      txn({ providerTransactionId: null, amount: -10 })
    );
    const c = transactionDedupeKey(
      txn({ providerTransactionId: null, amount: -11 })
    );
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('stores amounts in 1/10000 units with bank sign convention', () => {
    const c = normalizeProviderTransaction(txn({ amount: '-42.50' }));
    expect(c.amountMinor).toBe(-425_000);
    expect(minorUnitsToDecimal(c.amountMinor)).toBe('-42.5000');
    expect(c.status).toBe('posted');
    expect(normalizeProviderTransaction(txn({ pending: true })).status).toBe(
      'pending'
    );
  });

  it('rejects non-numeric amounts and bad dates', () => {
    expect(() => toMinorUnits('abc')).toThrow(TypeError);
    expect(() =>
      normalizeProviderTransaction(txn({ occurredAt: 'not-a-date' }))
    ).toThrow(TypeError);
  });
});

describe('reconcileLedger (JOV-4612)', () => {
  it.each([
    {
      name: 'pending superseded by posted via provider link',
      entries: [
        entry({
          id: 'p1',
          status: 'pending',
          providerTransactionId: 'pend_1',
        }),
        entry({
          id: 'p2',
          status: 'posted',
          providerTransactionId: 'post_1',
          pendingProviderId: 'pend_1',
        }),
      ],
      expect: { p1: { status: 'superseded', supersededById: 'p2' } },
    },
    {
      name: 'pending superseded by posted via amount+text window',
      entries: [
        entry({ id: 'p1', status: 'pending', occurredDay: 9 }),
        entry({ id: 'p2', status: 'posted', occurredDay: 10 }),
      ],
      expect: { p1: { status: 'superseded', supersededById: 'p2' } },
    },
    {
      name: 'reversal pair both excluded',
      entries: [
        entry({ id: 'p1', amountMinor: -500, occurredDay: 10 }),
        entry({ id: 'p2', amountMinor: 500, occurredDay: 11 }),
      ],
      expect: {
        p1: { flowKind: 'reversal' },
        p2: { flowKind: 'reversal' },
      },
    },
    {
      name: 'transfer across depository accounts',
      entries: [
        entry({
          id: 'p1',
          accountKey: 'a',
          amountMinor: -2000,
          textNorm: 'transfer to savings',
        }),
        entry({
          id: 'p2',
          accountKey: 'b',
          amountMinor: 2000,
          textNorm: 'transfer from checking',
        }),
      ],
      expect: { p1: { flowKind: 'transfer' }, p2: { flowKind: 'transfer' } },
    },
    {
      name: 'credit-card payment',
      entries: [
        entry({ id: 'p1', accountKey: 'a', amountMinor: -8000 }),
        entry({
          id: 'p2',
          accountKey: 'b',
          accountKind: 'credit',
          amountMinor: 8000,
        }),
      ],
      expect: {
        p1: { flowKind: 'cc_payment' },
        p2: { flowKind: 'cc_payment' },
      },
    },
    {
      name: 'same-amount same-account rows are not transfers',
      entries: [
        entry({ id: 'p1', accountKey: 'a', amountMinor: -2000 }),
        entry({ id: 'p2', accountKey: 'b', amountMinor: 2000 }),
      ],
      expect: { p1: { flowKind: 'spend' }, p2: { flowKind: 'income' } },
    },
    {
      name: 'refund marks the later inflow, keeps original spend',
      entries: [
        entry({ id: 'p1', amountMinor: -1500, occurredDay: 10 }),
        entry({ id: 'p2', amountMinor: 1500, occurredDay: 20 }),
      ],
      expect: {
        p1: { flowKind: 'spend', matchedTransactionId: 'p2' },
        p2: { flowKind: 'refund' },
      },
    },
    {
      name: 'reversed pair wins over refund classification',
      entries: [
        entry({ id: 'p1', amountMinor: -1500, occurredDay: 10 }),
        entry({ id: 'p2', amountMinor: 1500, occurredDay: 11 }),
      ],
      expect: { p1: { flowKind: 'reversal' }, p2: { flowKind: 'reversal' } },
    },
    {
      name: 'duplicate import flagged on the later row',
      entries: [
        entry({ id: 'p1', dedupeKey: 'k1', amountMinor: -900 }),
        entry({ id: 'p2', dedupeKey: 'k2', amountMinor: -900 }),
      ],
      expect: {
        p1: { flowKind: 'spend' },
        p2: { flowKind: 'duplicate', matchedTransactionId: 'p1' },
      },
    },
    {
      name: 'plain spend and income classify by sign',
      entries: [
        entry({ id: 'p1', amountMinor: -700 }),
        entry({ id: 'p2', amountMinor: 700, textNorm: 'payroll' }),
      ],
      expect: { p1: { flowKind: 'spend' }, p2: { flowKind: 'income' } },
    },
  ])('$name', ({ entries, expect: expected }) => {
    const muts = byId(reconcileLedger(entries));
    for (const [id, want] of Object.entries(expected)) {
      const m = muts.get(id);
      expect(m, `mutation for ${id}`).toBeDefined();
      for (const [k, v] of Object.entries(want)) {
        expect(m?.[k as keyof typeof m]).toBe(v);
      }
    }
  });

  it('is deterministic under out-of-order input', () => {
    const entries = [
      entry({ id: 'a1', amountMinor: -1000, textNorm: 'transfer out' }),
      entry({
        id: 'b1',
        accountKey: 'b',
        amountMinor: 1000,
        textNorm: 'transfer in',
      }),
      entry({ id: 'a2', status: 'pending', amountMinor: -500 }),
      entry({ id: 'a3', amountMinor: -500, pendingProviderId: 'p1' }),
    ];
    const forward = reconcileLedger(entries).map(m => `${m.id}:${m.reason}`);
    const reversed = reconcileLedger([...entries].reverse()).map(
      m => `${m.id}:${m.reason}`
    );
    expect(forward.sort()).toEqual(reversed.sort());
  });

  it('superseded and removed rows are never effective', () => {
    expect(isLedgerEffective({ status: 'superseded', flowKind: 'spend' })).toBe(
      false
    );
    expect(isLedgerEffective({ status: 'removed', flowKind: 'income' })).toBe(
      false
    );
    expect(isLedgerEffective({ status: 'posted', flowKind: 'transfer' })).toBe(
      false
    );
    expect(isLedgerEffective({ status: 'posted', flowKind: 'spend' })).toBe(
      true
    );
  });
});

describe('balance reconciliation (JOV-4612)', () => {
  it('computes drift = reported - (prev snapshot + posted delta)', () => {
    expect(
      balanceDrift({
        previousSnapshotMinor: 1_000_000,
        deltaMinor: -250_000,
        reportedMinor: 750_000,
      })
    ).toBe(0);
    expect(
      balanceDrift({
        previousSnapshotMinor: 1_000_000,
        deltaMinor: -250_000,
        reportedMinor: 800_000,
      })
    ).toBe(50_000);
  });

  it('tolerance: absolute floor, then 0.1% of reported', () => {
    expect(balanceWithinTolerance(500_000, 9_999)).toBe(true);
    expect(balanceWithinTolerance(500_000, 50_000)).toBe(false);
    // 0.1% of $100k (1e9 minor) = $100 = 1e6 minor
    expect(balanceWithinTolerance(1_000_000_000, 900_000)).toBe(true);
    expect(balanceWithinTolerance(1_000_000_000, 1_100_000)).toBe(false);
  });
});
