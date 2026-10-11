import { describe, expect, it } from 'vitest';
import type {
  CostLedger,
  CostLedgerAccount,
  CostLedgerEvidenceRef,
} from './contract';
import {
  detectExceptions,
  monthlyEquivalent,
  reconcileAccount,
  summarizeLedger,
} from './ledger';
import { assertPaymentInstrumentSafety } from './redaction';

const NOW = new Date('2026-10-01T00:00:00.000Z');
const FRESH = '2026-10-15T00:00:00.000Z';
const STALE_UNTIL = '2026-09-15T00:00:00.000Z';

function evidence(
  source: CostLedgerEvidenceRef['source'],
  freshUntil = FRESH
): CostLedgerEvidenceRef {
  return {
    source,
    ref: 'opaque-ref',
    observedAt: NOW.toISOString(),
    freshUntil,
    authority: 'observation',
  };
}

function account(
  overrides: Partial<CostLedgerAccount> = {}
): CostLedgerAccount {
  return {
    id: 'acct-1',
    vendorName: 'Vendor',
    state: 'active',
    cadence: 'monthly',
    amount: { cents: 2000, currency: 'USD' },
    costBasis: 'observed',
    evidence: [evidence('vendor-billing-api')],
    ...overrides,
  };
}

describe('monthlyEquivalent', () => {
  it('normalizes annual and quarterly into monthly without inventing precision', () => {
    expect(
      monthlyEquivalent(
        account({
          cadence: 'annual',
          amount: { cents: 24000, currency: 'USD' },
        })
      )
    ).toEqual({ cents: 2000, currency: 'USD', kind: 'normalized' });
    expect(
      monthlyEquivalent(
        account({
          cadence: 'quarterly',
          amount: { cents: 9000, currency: 'USD' },
        })
      )
    ).toEqual({ cents: 3000, currency: 'USD', kind: 'normalized' });
  });

  it('returns null for usage-based and unknown amounts', () => {
    expect(monthlyEquivalent(account({ cadence: 'usage-based' }))).toBeNull();
    expect(
      monthlyEquivalent(account({ cadence: 'monthly', amount: undefined }))
    ).toBeNull();
  });

  it('preserves settled basis as settled, never upgrades observation', () => {
    expect(
      monthlyEquivalent(account({ cadence: 'monthly', costBasis: 'settled' }))
    ).toEqual({ cents: 2000, currency: 'USD', kind: 'settled' });
    expect(
      monthlyEquivalent(account({ cadence: 'monthly', costBasis: 'observed' }))
    ).toEqual({ cents: 2000, currency: 'USD', kind: 'observed' });
  });
});

describe('reconcileAccount', () => {
  it('is unknown with no evidence and no transactions', () => {
    expect(reconcileAccount(account({ evidence: [] }), [], NOW)).toBe(
      'unknown'
    );
  });

  it('keeps billing-email evidence at observed — never reconciled', () => {
    expect(
      reconcileAccount(
        account({ evidence: [evidence('billing-email')] }),
        [],
        NOW
      )
    ).toBe('observed');
  });

  it('reconciles when a settled transaction matches the account', () => {
    const txn = {
      id: 't1',
      amount: { cents: 2000, currency: 'USD' },
      occurredAt: NOW.toISOString(),
      state: 'settled' as const,
      accountId: 'acct-1',
      evidence: [evidence('ledger-settlement')],
    };
    expect(reconcileAccount(account(), [txn], NOW)).toBe('reconciled');
  });

  it('flags conflict when the settled amount disagrees with the obligation', () => {
    const txn = {
      id: 't1',
      amount: { cents: 9999, currency: 'USD' },
      occurredAt: NOW.toISOString(),
      state: 'settled' as const,
      accountId: 'acct-1',
      evidence: [evidence('ledger-settlement')],
    };
    expect(reconcileAccount(account(), [txn], NOW)).toBe('conflict');
  });

  it('marks evidence past its freshness contract as stale', () => {
    expect(
      reconcileAccount(
        account({ evidence: [evidence('vendor-billing-api', STALE_UNTIL)] }),
        [],
        NOW
      )
    ).toBe('stale');
  });

  it('does not count pending transactions as settled proof', () => {
    const txn = {
      id: 't1',
      amount: { cents: 2000, currency: 'USD' },
      occurredAt: NOW.toISOString(),
      state: 'pending' as const,
      accountId: 'acct-1',
      evidence: [evidence('ledger-settlement')],
    };
    expect(reconcileAccount(account(), [txn], NOW)).toBe('observed');
  });
});

function ledger(partial: Partial<CostLedger> = {}): CostLedger {
  return {
    schema: 'ovie-cost-ledger/v1',
    generatedAt: NOW.toISOString(),
    accounts: [],
    instruments: [],
    transactions: [],
    capacity: [],
    credits: [],
    ...partial,
  };
}

describe('detectExceptions', () => {
  it('surfaces renewals and credit expiries inside the soon window', () => {
    const l = ledger({
      accounts: [account({ renewsAt: '2026-10-05T00:00:00.000Z' })],
      credits: [
        {
          accountId: 'acct-1',
          cashEquivalent: false,
          expiresAt: '2026-10-10T00:00:00.000Z',
          evidence: [evidence('vendor-billing-api')],
        },
      ],
    });
    const kinds = detectExceptions(l, NOW).map(e => e.kind);
    expect(kinds).toContain('renews-soon');
    expect(kinds).toContain('credit-expires-soon');
  });

  it('surfaces banked capacity and unmatched settled transactions', () => {
    const l = ledger({
      capacity: [
        {
          accountId: 'acct-1',
          health: 'banked',
          evidence: [evidence('runtime-telemetry')],
        },
      ],
      transactions: [
        {
          id: 'tx-9',
          amount: { cents: 500, currency: 'USD' },
          occurredAt: NOW.toISOString(),
          state: 'settled',
          merchantLabel: 'MYSTERY CO',
          evidence: [evidence('ledger-settlement')],
        },
      ],
    });
    const kinds = detectExceptions(l, NOW).map(e => e.kind);
    expect(kinds).toContain('capacity-limited');
    expect(kinds).toContain('unmatched-transaction');
  });

  it('flags possible duplicates sharing vendor, plan, and instrument', () => {
    const l = ledger({
      accounts: [
        account({ id: 'a1', plan: 'Pro', instrumentId: 'card-1' }),
        account({ id: 'a2', plan: 'Pro', instrumentId: 'card-1' }),
      ],
    });
    const kinds = detectExceptions(l, NOW).map(e => e.kind);
    expect(kinds).toContain('possible-duplicate');
  });
});

describe('summarizeLedger', () => {
  it('reports not-measured instead of $0 when evidence is absent', () => {
    const summary = summarizeLedger(ledger());
    expect(summary.recurringMonthlySpend.state).toBe('not-measured');
    expect(summary.recurringMonthlySpend.value).toBeNull();
    expect(summary.verifiedMrr.state).toBe('not-measured');
    expect(summary.netBurn.state).toBe('not-measured');
    expect(summary.runwayMonths).toBeNull();
    expect(summary.defaultAlive).toBe('unknown');
  });

  it('sums normalized monthly spend and marks basis mixed when projected', () => {
    const summary = summarizeLedger(
      ledger({
        accounts: [
          account({ cadence: 'monthly', costBasis: 'settled' }),
          account({
            id: 'a2',
            cadence: 'annual',
            amount: { cents: 12000, currency: 'USD' },
          }),
        ],
      })
    );
    expect(summary.recurringMonthlySpend.value).toEqual({
      cents: 3000,
      currency: 'USD',
    });
    expect(summary.recurringMonthlySpend.basis).toBe('mixed');
  });

  it('never reports a default-alive label without verified inputs', () => {
    const summary = summarizeLedger(
      ledger({
        accounts: [account({ costBasis: 'settled' })],
        revenue: { mrr: { cents: 5000, currency: 'USD' }, evidence: [] },
      })
    );
    // MRR without evidence is not verified — label must stay unknown.
    expect(summary.defaultAlive).toBe('unknown');
    expect(summary.verifiedMrr.state).toBe('not-measured');
  });

  it('computes default-alive only when MRR, burn, and cash are verified', () => {
    const summary = summarizeLedger(
      ledger({
        accounts: [account({ costBasis: 'settled' })],
        revenue: {
          mrr: { cents: 5000, currency: 'USD' },
          evidence: [evidence('vendor-billing-api')],
        },
        cash: {
          balance: { cents: 10000, currency: 'USD' },
          evidence: [evidence('ledger-settlement')],
        },
      })
    );
    expect(summary.defaultAlive).toBe('default-alive');
    expect(summary.netBurn.value).toEqual({ cents: -3000, currency: 'USD' });
  });

  it('computes runway only when net burn is positive and cash verified', () => {
    const summary = summarizeLedger(
      ledger({
        accounts: [
          account({
            amount: { cents: 4000, currency: 'USD' },
            costBasis: 'settled',
          }),
        ],
        revenue: {
          mrr: { cents: 1000, currency: 'USD' },
          evidence: [evidence('vendor-billing-api')],
        },
        cash: {
          balance: { cents: 9000, currency: 'USD' },
          evidence: [evidence('ledger-settlement')],
        },
      })
    );
    expect(summary.runwayMonths).toBe(3);
    expect(summary.defaultAlive).toBe('default-dead');
  });

  it('never counts prepaid vendor credits as cash or runway', () => {
    const summary = summarizeLedger(
      ledger({
        credits: [
          {
            accountId: 'acct-1',
            remaining: { cents: 700000, currency: 'USD' },
            cashEquivalent: false,
            evidence: [evidence('vendor-billing-api')],
          },
        ],
      })
    );
    expect(summary.runwayMonths).toBeNull();
    expect(summary.defaultAlive).toBe('unknown');
  });
});

describe('assertPaymentInstrumentSafety', () => {
  it('accepts label plus last4', () => {
    expect(
      assertPaymentInstrumentSafety({
        id: 'i1',
        type: 'business-card',
        label: 'Mercury debit',
        last4: '4242',
      }).last4
    ).toBe('4242');
  });

  it('rejects PAN-like digits in any field', () => {
    expect(() =>
      assertPaymentInstrumentSafety({
        id: 'i1',
        type: 'business-card',
        label: 'Card 4242424242424242',
      })
    ).toThrow(/PAN/);
    expect(() =>
      assertPaymentInstrumentSafety({
        id: 'i1',
        type: 'business-card',
        label: 'Card',
        last4: '42424242',
      })
    ).toThrow(/last4/);
  });
});
