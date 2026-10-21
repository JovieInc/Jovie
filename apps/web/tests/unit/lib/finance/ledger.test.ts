import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  balanceDrift,
  balanceWithinTolerance,
  type FlowKind,
  isLedgerEffective,
  type LedgerEntry,
  type LedgerMutation,
  minorUnitsToDecimal,
  normalizeProviderTransaction,
  normalizeText,
  type ProviderTransaction,
  providerIdDedupeKey,
  reconcileLedger,
  toMinorUnits,
  transactionDedupeKey,
} from '@/lib/finance/ledger';

const DAY = 86_400_000;
const d = (day: number) => new Date(day * DAY).toISOString();
const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

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

const byId = (muts: readonly LedgerMutation[]) =>
  new Map(muts.map(m => [m.id, m]));

const flows = (muts: readonly LedgerMutation[]) =>
  Object.fromEntries(muts.map(m => [m.id, m.flowKind]));

describe('toMinorUnits / minorUnitsToDecimal', () => {
  it('scales numbers and numeric strings to integer 1/10000 units', () => {
    expect(toMinorUnits(1)).toBe(10_000);
    expect(toMinorUnits('-42.50')).toBe(-425_000);
    expect(toMinorUnits('0.0001')).toBe(1);
    expect(toMinorUnits(0)).toBe(0);
  });

  it('rounds sub-unit precision to the nearest unit', () => {
    expect(toMinorUnits(0.00004)).toBe(0);
    expect(toMinorUnits(0.00006)).toBe(1);
    expect(toMinorUnits('12.34567')).toBe(123_457);
  });

  it.each([
    ['abc', 'abc'],
    [Number.NaN, 'NaN'],
    [Number.POSITIVE_INFINITY, 'Infinity'],
    ['Infinity', 'Infinity'],
  ])('rejects non-finite amount %s', (amount, label) => {
    expect(() => toMinorUnits(amount)).toThrow(
      new TypeError(`Invalid transaction amount: ${label}`)
    );
  });

  it('formats minor units as a fixed 4-decimal string', () => {
    expect(minorUnitsToDecimal(-425_000)).toBe('-42.5000');
    expect(minorUnitsToDecimal(1)).toBe('0.0001');
    expect(minorUnitsToDecimal(0)).toBe('0.0000');
    expect(minorUnitsToDecimal(123_456_789)).toBe('12345.6789');
  });
});

describe('normalizeText', () => {
  it('lowercases, strips punctuation, and collapses whitespace', () => {
    expect(normalizeText('  Blue Bottle  COFFEE #12!! ')).toBe(
      'blue bottle coffee 12'
    );
    expect(normalizeText('ACH*Payment--To\tSavings')).toBe(
      'ach payment to savings'
    );
  });

  it('maps null and undefined to an empty string', () => {
    expect(normalizeText(null)).toBe('');
    expect(normalizeText(undefined)).toBe('');
    expect(normalizeText('***')).toBe('');
  });
});

describe('transactionDedupeKey', () => {
  it('hashes the provider transaction id when present', () => {
    expect(transactionDedupeKey(txn({ providerTransactionId: 'pt_x' }))).toBe(
      sha256('id:pt_x')
    );
    expect(providerIdDedupeKey('pt_x')).toBe(sha256('id:pt_x'));
  });

  it('ignores content changes when the provider id is present', () => {
    expect(
      transactionDedupeKey(txn({ providerTransactionId: 'pt_x', amount: 5 }))
    ).toBe(transactionDedupeKey(txn({ providerTransactionId: 'pt_x' })));
  });

  it('fingerprints account, amount, day, and description when the id is missing', () => {
    const key = transactionDedupeKey(
      txn({
        providerTransactionId: null,
        amount: '-10.00',
        occurredAt: `${d(10).slice(0, 10)}T15:30:00.000Z`,
        description: 'Coffee, Shop!',
        merchantName: 'ignored merchant',
      })
    );
    expect(key).toBe(sha256('fp:pa_1|-100000|10|coffee shop'));
  });

  it('falls back to merchant name, then empty text, in the fingerprint', () => {
    expect(
      transactionDedupeKey(
        txn({ providerTransactionId: null, merchantName: 'Blue Bottle' })
      )
    ).toBe(sha256('fp:pa_1|-100000|10|blue bottle'));
    expect(transactionDedupeKey(txn({ providerTransactionId: null }))).toBe(
      sha256('fp:pa_1|-100000|10|')
    );
  });

  it('treats an empty provider id as missing', () => {
    expect(transactionDedupeKey(txn({ providerTransactionId: '' }))).toBe(
      sha256('fp:pa_1|-100000|10|')
    );
  });

  it('changes the fingerprint when any identifying field changes', () => {
    const base = txn({ providerTransactionId: null });
    const key = transactionDedupeKey(base);
    expect(transactionDedupeKey({ ...base, amount: -11 })).not.toBe(key);
    expect(
      transactionDedupeKey({ ...base, providerAccountId: 'pa_2' })
    ).not.toBe(key);
    expect(transactionDedupeKey({ ...base, occurredAt: d(11) })).not.toBe(key);
    expect(transactionDedupeKey({ ...base, description: 'x' })).not.toBe(key);
  });
});

describe('normalizeProviderTransaction', () => {
  it('maps a posted provider record to the full canonical shape', () => {
    const canonical = normalizeProviderTransaction(
      txn({
        amount: '-42.50',
        occurredAt: '1970-01-11T18:45:00.000Z',
        merchantName: 'Blue Bottle',
        description: 'BLUE BOTTLE #4',
        category: 'food',
        pendingTransactionId: 'pend_9',
      })
    );
    expect(canonical).toEqual({
      dedupeKey: sha256('id:pt_1'),
      providerTransactionId: 'pt_1',
      providerAccountId: 'pa_1',
      amountMinor: -425_000,
      currency: 'USD',
      occurredDay: 10,
      occurredAt: new Date(10 * DAY),
      merchantName: 'Blue Bottle',
      description: 'BLUE BOTTLE #4',
      textNorm: 'blue bottle 4',
      category: 'food',
      status: 'posted',
      pendingProviderId: 'pend_9',
    });
  });

  it('defaults optional fields to null and marks pending records', () => {
    const canonical = normalizeProviderTransaction(txn({ pending: true }));
    expect(canonical.status).toBe('pending');
    expect(canonical.merchantName).toBeNull();
    expect(canonical.description).toBeNull();
    expect(canonical.category).toBeNull();
    expect(canonical.pendingProviderId).toBeNull();
    expect(canonical.textNorm).toBe('');
  });

  it('floors pre-epoch timestamps to the earlier UTC day', () => {
    const canonical = normalizeProviderTransaction(
      txn({ occurredAt: '1969-12-31T12:00:00.000Z' })
    );
    expect(canonical.occurredDay).toBe(-1);
    expect(canonical.occurredAt.toISOString()).toBe('1969-12-31T00:00:00.000Z');
  });

  it('rejects unparseable dates with the offending value', () => {
    expect(() =>
      normalizeProviderTransaction(txn({ occurredAt: 'not-a-date' }))
    ).toThrow(new TypeError('Invalid transaction date: not-a-date'));
  });
});

describe('reconcileLedger: pending → posted supersession', () => {
  it('links via the provider pending id and records both sides', () => {
    const muts = reconcileLedger([
      entry({
        id: 'p1',
        status: 'pending',
        providerTransactionId: 'pend_1',
        textNorm: 'pending text',
        amountMinor: -999,
      }),
      entry({
        id: 'p2',
        providerTransactionId: 'post_1',
        pendingProviderId: 'pend_1',
      }),
    ]);
    expect(muts).toEqual([
      {
        id: 'p1',
        status: 'superseded',
        supersededById: 'p2',
        reason: 'pending_superseded',
      },
      {
        id: 'p2',
        matchedTransactionId: 'p1',
        flowKind: 'spend',
        reason: 'default_classification',
      },
    ]);
  });

  it('does not fall back to content matching when a pending id is reported', () => {
    const muts = reconcileLedger([
      entry({ id: 'p1', status: 'pending', providerTransactionId: 'pend_1' }),
      entry({ id: 'p2', pendingProviderId: 'pend_other' }),
    ]);
    expect(byId(muts).get('p1')).toBeUndefined();
    expect(byId(muts).get('p2')).toEqual({
      id: 'p2',
      flowKind: 'spend',
      reason: 'default_classification',
    });
  });

  it.each([
    { name: '3 days earlier', pendingDay: 7, linked: true },
    { name: '3 days later', pendingDay: 13, linked: true },
    { name: '4 days earlier', pendingDay: 6, linked: false },
    { name: '4 days later', pendingDay: 14, linked: false },
  ])(
    'content match window: pending $name → linked=$linked',
    ({ pendingDay, linked }) => {
      const muts = byId(
        reconcileLedger([
          entry({ id: 'p1', status: 'pending', occurredDay: pendingDay }),
          entry({ id: 'p2', occurredDay: 10 }),
        ])
      );
      expect(muts.get('p1')?.status).toBe(linked ? 'superseded' : undefined);
      expect(muts.get('p2')?.matchedTransactionId).toBe(
        linked ? 'p1' : undefined
      );
    }
  );

  it.each([
    { name: 'account', patch: { accountKey: 'acct-b' } },
    { name: 'amount', patch: { amountMinor: -1001 } },
    { name: 'text', patch: { textNorm: 'other shop' } },
  ])('requires the same $name for a content match', ({ patch }) => {
    const muts = byId(
      reconcileLedger([
        entry({ id: 'p1', status: 'pending', ...patch }),
        entry({ id: 'p2' }),
      ])
    );
    expect(muts.get('p1')).toBeUndefined();
    expect(muts.get('p2')?.matchedTransactionId).toBeUndefined();
  });

  it('never links a pending row that is already matched or superseded', () => {
    const muts = byId(
      reconcileLedger([
        entry({ id: 'p1', status: 'pending', matchedTransactionId: 'x' }),
        entry({ id: 'p3', status: 'pending', supersededById: 'y' }),
        entry({ id: 'p2' }),
      ])
    );
    expect(muts.get('p1')).toBeUndefined();
    expect(muts.get('p3')).toBeUndefined();
    expect(muts.get('p2')?.matchedTransactionId).toBeUndefined();
  });

  it('links each pending row at most once, earliest posted row first', () => {
    const muts = byId(
      reconcileLedger([
        entry({ id: 'a-late', occurredDay: 12 }),
        entry({ id: 'z-early', occurredDay: 10 }),
        entry({ id: 'pend', status: 'pending', occurredDay: 10 }),
      ])
    );
    expect(muts.get('pend')?.supersededById).toBe('z-early');
    expect(muts.get('z-early')?.matchedTransactionId).toBe('pend');
    expect(muts.get('a-late')?.matchedTransactionId).toBeUndefined();
  });

  it('breaks same-day ties by id', () => {
    const muts = byId(
      reconcileLedger([
        entry({ id: 'b', occurredDay: 10 }),
        entry({ id: 'a', occurredDay: 10 }),
        entry({ id: 'pend', status: 'pending', occurredDay: 10 }),
      ])
    );
    expect(muts.get('pend')?.supersededById).toBe('a');
  });

  it('leaves unmatched pending rows untouched', () => {
    expect(reconcileLedger([entry({ id: 'p1', status: 'pending' })])).toEqual(
      []
    );
  });
});

describe('reconcileLedger: reversals', () => {
  it('pairs an exact negation on the same account and text', () => {
    expect(
      reconcileLedger([
        entry({ id: 'p1', amountMinor: -500, occurredDay: 10 }),
        entry({ id: 'p2', amountMinor: 500, occurredDay: 11 }),
      ])
    ).toEqual([
      {
        id: 'p1',
        flowKind: 'reversal',
        matchedTransactionId: 'p2',
        reason: 'reversal_pair',
      },
      {
        id: 'p2',
        flowKind: 'reversal',
        matchedTransactionId: 'p1',
        reason: 'reversal_pair',
      },
    ]);
  });

  it.each([
    { gap: 0, kind: 'reversal' },
    { gap: 3, kind: 'reversal' },
    { gap: 4, kind: 'refund' },
  ])('a $gap-day gap classifies the inflow as $kind', ({ gap, kind }) => {
    const muts = byId(
      reconcileLedger([
        entry({ id: 'p1', amountMinor: -500, occurredDay: 10 }),
        entry({ id: 'p2', amountMinor: 500, occurredDay: 10 + gap }),
      ])
    );
    expect(muts.get('p2')?.flowKind).toBe(kind);
  });

  it('requires matching text', () => {
    expect(
      flows(
        reconcileLedger([
          entry({ id: 'p1', amountMinor: -500 }),
          entry({ id: 'p2', amountMinor: 500, textNorm: 'other' }),
        ])
      )
    ).toEqual({ p1: 'spend', p2: 'income' });
  });

  it('does not pair a row with itself or with a removed row', () => {
    expect(
      flows(
        reconcileLedger([
          entry({ id: 'p1', amountMinor: 0 }),
          entry({ id: 'p2', amountMinor: 500, status: 'removed' }),
          entry({ id: 'p3', amountMinor: -500, occurredDay: 11 }),
        ])
      )
    ).toEqual({ p1: 'income', p3: 'spend' });
  });
});

describe('reconcileLedger: transfers and card payments', () => {
  it('pairs opposite amounts across accounts when the text signals a transfer', () => {
    expect(
      reconcileLedger([
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
          textNorm: 'deposit',
        }),
      ])
    ).toEqual([
      {
        id: 'p1',
        flowKind: 'transfer',
        matchedTransactionId: 'p2',
        reason: 'transfer_pair',
      },
      {
        id: 'p2',
        flowKind: 'transfer',
        matchedTransactionId: 'p1',
        reason: 'transfer_pair',
      },
    ]);
  });

  it.each([
    'xfer',
    'ach',
    'zelle',
    'venmo',
    'paypal tfr',
    'payment to',
    'payment from',
    'autopay',
    'online payment',
    'credit card',
    'bill pay',
  ])('recognizes "%s" as a transfer signal on either side', keyword => {
    const muts = reconcileLedger([
      entry({ id: 'p1', accountKey: 'a', amountMinor: -2000, textNorm: 'x' }),
      entry({
        id: 'p2',
        accountKey: 'b',
        amountMinor: 2000,
        textNorm: `acme ${keyword} 42`,
      }),
    ]);
    expect(flows(muts)).toEqual({ p1: 'transfer', p2: 'transfer' });
  });

  it('requires a whole-word transfer signal', () => {
    const muts = reconcileLedger([
      entry({ id: 'p1', accountKey: 'a', amountMinor: -2000 }),
      entry({
        id: 'p2',
        accountKey: 'b',
        amountMinor: 2000,
        textNorm: 'transferwise coaching',
      }),
    ]);
    expect(flows(muts)).toEqual({ p1: 'spend', p2: 'income' });
  });

  it('does not pair same-amount rows without a signal or credit account', () => {
    const muts = reconcileLedger([
      entry({ id: 'p1', accountKey: 'a', amountMinor: -2000 }),
      entry({ id: 'p2', accountKey: 'b', amountMinor: 2000 }),
    ]);
    expect(flows(muts)).toEqual({ p1: 'spend', p2: 'income' });
  });

  it('does not pair a transfer within the same account', () => {
    const muts = reconcileLedger([
      entry({ id: 'p1', amountMinor: -2000, textNorm: 'transfer out' }),
      entry({ id: 'p2', amountMinor: 2000, textNorm: 'transfer in' }),
    ]);
    expect(flows(muts)).toEqual({ p1: 'spend', p2: 'income' });
  });

  it.each([
    { gap: 5, paired: true },
    { gap: -5, paired: true },
    { gap: 6, paired: false },
    { gap: -6, paired: false },
  ])('transfer window gap $gap → paired=$paired', ({ gap, paired }) => {
    const muts = reconcileLedger([
      entry({
        id: 'p1',
        accountKey: 'a',
        amountMinor: -2000,
        occurredDay: 20,
        textNorm: 'zelle',
      }),
      entry({
        id: 'p2',
        accountKey: 'b',
        amountMinor: 2000,
        occurredDay: 20 + gap,
        textNorm: 'zelle',
      }),
    ]);
    expect(flows(muts)).toEqual(
      paired
        ? { p1: 'transfer', p2: 'transfer' }
        : { p1: 'spend', p2: 'income' }
    );
  });

  it.each([
    { name: 'earlier row', creditId: 'p1' },
    { name: 'later row', creditId: 'p2' },
  ])(
    'classifies as cc_payment when the $name is a credit account',
    ({ creditId }) => {
      const muts = reconcileLedger([
        entry({
          id: 'p1',
          accountKey: 'a',
          amountMinor: -8000,
          occurredDay: 10,
          accountKind: creditId === 'p1' ? 'credit' : 'depository',
        }),
        entry({
          id: 'p2',
          accountKey: 'b',
          amountMinor: 8000,
          occurredDay: 11,
          accountKind: creditId === 'p2' ? 'credit' : 'depository',
        }),
      ]);
      expect(muts).toEqual([
        {
          id: 'p1',
          flowKind: 'cc_payment',
          matchedTransactionId: 'p2',
          reason: 'cc_payment_pair',
        },
        {
          id: 'p2',
          flowKind: 'cc_payment',
          matchedTransactionId: 'p1',
          reason: 'cc_payment_pair',
        },
      ]);
    }
  );

  it('keeps a posted row that superseded a pending row eligible for transfer pairing', () => {
    const muts = byId(
      reconcileLedger([
        entry({
          id: 'a0',
          accountKey: 'a',
          status: 'pending',
          amountMinor: -3000,
          textNorm: 'zelle',
          occurredDay: 9,
        }),
        entry({
          id: 'a1',
          accountKey: 'a',
          amountMinor: -3000,
          textNorm: 'zelle',
          occurredDay: 10,
        }),
        entry({
          id: 'b1',
          accountKey: 'b',
          amountMinor: 3000,
          textNorm: 'zelle',
          occurredDay: 10,
        }),
      ])
    );
    expect(muts.get('a0')?.supersededById).toBe('a1');
    expect(muts.get('a1')).toEqual({
      id: 'a1',
      flowKind: 'transfer',
      matchedTransactionId: 'b1',
      reason: 'transfer_pair',
    });
    expect(muts.get('b1')?.matchedTransactionId).toBe('a1');
  });
});

describe('reconcileLedger: refunds', () => {
  it('marks the later inflow as refund and keeps the spend', () => {
    expect(
      reconcileLedger([
        entry({ id: 'p1', amountMinor: -1500, occurredDay: 10 }),
        entry({ id: 'p2', amountMinor: 1500, occurredDay: 20 }),
      ])
    ).toEqual([
      {
        id: 'p2',
        flowKind: 'refund',
        matchedTransactionId: 'p1',
        reason: 'refund_of_spend',
      },
      {
        id: 'p1',
        matchedTransactionId: 'p2',
        flowKind: 'spend',
        reason: 'default_classification',
      },
    ]);
  });

  it.each([
    { gap: 90, refund: true },
    { gap: 91, refund: false },
  ])('refund window gap $gap → refund=$refund', ({ gap, refund }) => {
    const muts = reconcileLedger([
      entry({ id: 'p1', amountMinor: -1500, occurredDay: 10 }),
      entry({ id: 'p2', amountMinor: 1500, occurredDay: 10 + gap }),
    ]);
    expect(flows(muts)).toEqual({
      p1: 'spend',
      p2: refund ? 'refund' : 'income',
    });
  });

  it('never treats an earlier inflow as a refund of a later outflow', () => {
    const muts = reconcileLedger([
      entry({ id: 'p1', amountMinor: 1500, occurredDay: 10 }),
      entry({ id: 'p2', amountMinor: -1500, occurredDay: 20 }),
    ]);
    expect(flows(muts)).toEqual({ p1: 'income', p2: 'spend' });
  });

  it('does not treat zero-amount rows as refunds', () => {
    const muts = reconcileLedger([
      entry({ id: 'p1', amountMinor: 0, occurredDay: 10, dedupeKey: 'a' }),
      entry({ id: 'p2', amountMinor: 0, occurredDay: 20, dedupeKey: 'b' }),
    ]);
    expect(flows(muts)).toEqual({ p1: 'income', p2: 'income' });
  });

  it.each([
    { name: 'account', patch: { accountKey: 'acct-b' } },
    { name: 'text', patch: { textNorm: 'other' } },
  ])('requires the same $name', ({ patch }) => {
    const muts = reconcileLedger([
      entry({ id: 'p1', amountMinor: -1500, occurredDay: 10 }),
      entry({ id: 'p2', amountMinor: 1500, occurredDay: 20, ...patch }),
    ]);
    expect(flows(muts)).toEqual({ p1: 'spend', p2: 'income' });
  });

  it('only matches rows that are still unclassified', () => {
    const muts = reconcileLedger([
      entry({
        id: 'p1',
        amountMinor: -1500,
        occurredDay: 10,
        flowKind: 'spend',
      }),
      entry({ id: 'p2', amountMinor: 1500, occurredDay: 20 }),
      entry({
        id: 'p3',
        amountMinor: 700,
        occurredDay: 20,
        flowKind: 'income',
        textNorm: 'payroll',
      }),
      entry({
        id: 'p4',
        amountMinor: -700,
        occurredDay: 10,
        textNorm: 'payroll',
      }),
    ]);
    expect(flows(muts)).toEqual({ p2: 'income', p4: 'spend' });
  });
});

describe('reconcileLedger: duplicate imports', () => {
  it('flags the later row of an identical pair with distinct dedupe keys', () => {
    expect(
      reconcileLedger([
        entry({ id: 'p2', dedupeKey: 'k2', amountMinor: -900 }),
        entry({ id: 'p1', dedupeKey: 'k1', amountMinor: -900 }),
      ])
    ).toEqual([
      {
        id: 'p2',
        flowKind: 'duplicate',
        matchedTransactionId: 'p1',
        reason: 'duplicate_import',
      },
      { id: 'p1', flowKind: 'spend', reason: 'default_classification' },
    ]);
  });

  it.each([
    { name: 'same dedupe key', patch: { dedupeKey: 'k1' } },
    { name: 'different day', patch: { occurredDay: 11 } },
    { name: 'different amount', patch: { amountMinor: -901 } },
    { name: 'different account', patch: { accountKey: 'acct-b' } },
    { name: 'different text', patch: { textNorm: 'other' } },
  ])('does not flag rows with a $name', ({ patch }) => {
    const muts = reconcileLedger([
      entry({ id: 'p1', dedupeKey: 'k1', amountMinor: -900 }),
      entry({ id: 'p2', dedupeKey: 'k2', amountMinor: -900, ...patch }),
    ]);
    expect(flows(muts)).toEqual({ p1: 'spend', p2: 'spend' });
  });

  it('flags a duplicate pending row without classifying it', () => {
    const muts = reconcileLedger([
      entry({
        id: 'p1',
        dedupeKey: 'k1',
        status: 'pending',
        amountMinor: -900,
      }),
      entry({
        id: 'p2',
        dedupeKey: 'k2',
        status: 'pending',
        amountMinor: -900,
      }),
    ]);
    expect(muts).toEqual([
      {
        id: 'p2',
        flowKind: 'duplicate',
        matchedTransactionId: 'p1',
        reason: 'duplicate_import',
      },
    ]);
  });
});

describe('reconcileLedger: default classification and stability', () => {
  it('classifies unmatched posted rows by sign (zero counts as income)', () => {
    expect(
      flows(
        reconcileLedger([
          entry({ id: 'p1', amountMinor: -1 }),
          entry({ id: 'p2', amountMinor: 1, textNorm: 'payroll' }),
          entry({ id: 'p3', amountMinor: 0, textNorm: 'zero' }),
        ])
      )
    ).toEqual({ p1: 'spend', p2: 'income', p3: 'income' });
  });

  it('keeps existing classifications and skips removed rows', () => {
    expect(
      reconcileLedger([
        entry({ id: 'p1', flowKind: 'spend' }),
        entry({ id: 'p2', status: 'removed', textNorm: 'x' }),
        entry({ id: 'p3', status: 'superseded', textNorm: 'y' }),
      ])
    ).toEqual([]);
  });

  it('returns identical mutations regardless of input order', () => {
    const entries = [
      entry({ id: 'a1', amountMinor: -1000, textNorm: 'transfer out' }),
      entry({
        id: 'b1',
        accountKey: 'b',
        amountMinor: 1000,
        textNorm: 'transfer in',
      }),
      entry({ id: 'a2', status: 'pending', amountMinor: -500, occurredDay: 9 }),
      entry({ id: 'a3', amountMinor: -500 }),
      entry({ id: 'a4', amountMinor: -500, occurredDay: 8, dedupeKey: 'z' }),
    ];
    expect(reconcileLedger([...entries].reverse())).toEqual(
      reconcileLedger(entries)
    );
  });
});

describe('isLedgerEffective', () => {
  it.each<FlowKind>(['spend', 'income', 'refund', 'unclassified'])(
    'counts posted %s rows',
    flowKind => {
      expect(isLedgerEffective({ status: 'posted', flowKind })).toBe(true);
    }
  );

  it.each<FlowKind>(['transfer', 'cc_payment', 'reversal', 'duplicate'])(
    'excludes posted %s rows',
    flowKind => {
      expect(isLedgerEffective({ status: 'posted', flowKind })).toBe(false);
    }
  );

  it.each(['pending', 'removed', 'superseded'] as const)(
    'excludes %s spend rows',
    status => {
      expect(isLedgerEffective({ status, flowKind: 'spend' })).toBe(false);
    }
  );
});

describe('balance reconciliation', () => {
  it('computes drift = reported - (previous snapshot + posted delta)', () => {
    expect(
      balanceDrift({
        previousSnapshotMinor: 100,
        deltaMinor: 30,
        reportedMinor: 200,
      })
    ).toBe(70);
    expect(
      balanceDrift({
        previousSnapshotMinor: 1_000_000,
        deltaMinor: -250_000,
        reportedMinor: 750_000,
      })
    ).toBe(0);
  });

  it('accepts drift up to the absolute floor in either direction', () => {
    expect(balanceWithinTolerance(500_000, 10_000)).toBe(true);
    expect(balanceWithinTolerance(500_000, -10_000)).toBe(true);
    expect(balanceWithinTolerance(500_000, 10_001)).toBe(false);
    expect(balanceWithinTolerance(500_000, -10_001)).toBe(false);
  });

  it('switches to 0.1% of the reported balance on large accounts', () => {
    expect(balanceWithinTolerance(1_000_000_000, 1_000_000)).toBe(true);
    expect(balanceWithinTolerance(1_000_000_000, 1_000_001)).toBe(false);
    expect(balanceWithinTolerance(-1_000_000_000, -1_000_000)).toBe(true);
  });

  it('honors a custom absolute floor', () => {
    expect(balanceWithinTolerance(0, 4, 4)).toBe(true);
    expect(balanceWithinTolerance(0, 5, 4)).toBe(false);
    expect(balanceWithinTolerance(2_500, 2, 0)).toBe(true);
    expect(balanceWithinTolerance(2_500, 3, 0)).toBe(false);
  });
});
