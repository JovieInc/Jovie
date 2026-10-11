import { describe, expect, it } from 'vitest';
import { MIXED_OWNER_FINANCE_FIXTURE } from '@/tests/fixtures/finance-domain';
import {
  FINANCE_ENTITY_DEFINITIONS,
  FINANCE_ENTITY_IDS,
} from './domain-contracts';
import {
  FINANCE_EDGE_CASE_IDS,
  FINANCE_EDGE_CASES,
  FINANCE_METRIC_DEFINITIONS,
  FINANCE_METRIC_IDS,
  FINANCE_SHARED_CREATOR_CONTEXT_DEFAULT,
  FINANCE_WINDOW_DEFINITIONS,
  FINANCE_WINDOW_IDS,
  OWNER_OPT_IN_CREATOR_METRIC_IDS,
} from './metric-contracts';
import {
  evaluateFinanceConfidence,
  evaluateFinanceTarget,
  evaluateFinanceTrend,
} from './metric-evaluation';

describe('owner-scoped finance domain contract (JOV-4610)', () => {
  it.each(FINANCE_ENTITY_IDS)(
    '%s has one authenticated-individual owner path',
    id => {
      const definition = FINANCE_ENTITY_DEFINITIONS[id];
      expect(definition.id).toBe(id);
      expect(definition.authorizationPrincipal).toBe(
        'authenticated_individual'
      );
      expect(definition.ownerPath).toMatch(/users\.id/);
      expect(definition.storage).not.toMatch(/creator|workspace|member/i);
      for (const relationship of definition.relationships) {
        expect(relationship.sameOwner).toBe(true);
        expect(FINANCE_ENTITY_IDS).toContain(relationship.parent);
      }
    }
  );

  it('keeps every mixed personal/business fixture row on one owner path', () => {
    const groups = [
      MIXED_OWNER_FINANCE_FIXTURE.accounts,
      MIXED_OWNER_FINANCE_FIXTURE.balances,
      MIXED_OWNER_FINANCE_FIXTURE.transactions,
      MIXED_OWNER_FINANCE_FIXTURE.classifications,
      MIXED_OWNER_FINANCE_FIXTURE.links,
    ];
    const records = groups.flat();
    expect(records.length).toBeGreaterThan(0);
    expect(new Set(records.map(record => record.ownerUserId))).toEqual(
      new Set([MIXED_OWNER_FINANCE_FIXTURE.ownerUserId])
    );

    const accountIds = new Set(
      MIXED_OWNER_FINANCE_FIXTURE.accounts.map(account => account.id)
    );
    const transactionIds = new Set(
      MIXED_OWNER_FINANCE_FIXTURE.transactions.map(
        transaction => transaction.id
      )
    );
    for (const balance of MIXED_OWNER_FINANCE_FIXTURE.balances) {
      expect(accountIds.has(balance.accountId)).toBe(true);
    }
    for (const transaction of MIXED_OWNER_FINANCE_FIXTURE.transactions) {
      expect(accountIds.has(transaction.accountId)).toBe(true);
    }
    for (const classification of MIXED_OWNER_FINANCE_FIXTURE.classifications) {
      expect(transactionIds.has(classification.transactionId)).toBe(true);
    }
  });

  it('represents mixed accounts and irregular creator income', () => {
    expect(
      new Set(MIXED_OWNER_FINANCE_FIXTURE.accounts.map(account => account.kind))
    ).toEqual(new Set(['asset', 'liability']));
    const royaltyDates = MIXED_OWNER_FINANCE_FIXTURE.transactions
      .filter(transaction => transaction.id.startsWith('royalty-'))
      .map(transaction => transaction.postedAt);
    expect(royaltyDates).toEqual([
      '2026-01-15T00:00:00.000Z',
      '2026-04-15T00:00:00.000Z',
      '2026-09-15T00:00:00.000Z',
    ]);
  });
});

describe('canonical finance metric definitions', () => {
  it.each(FINANCE_METRIC_IDS)(
    '%s has complete UI and calculation semantics',
    id => {
      const metric = FINANCE_METRIC_DEFINITIONS[id];
      expect(metric.id).toBe(id);
      expect(metric.label.length).toBeGreaterThan(0);
      expect(metric.formula.length).toBeGreaterThan(20);
      expect(FINANCE_WINDOW_IDS).toContain(metric.window);
      expect(metric.zeroDisplay.length).toBeGreaterThan(0);
      expect(metric.unavailableDisplay.length).toBeGreaterThan(0);
    }
  );

  it.each(FINANCE_WINDOW_IDS)(
    '%s defines current, comparison, and history rules',
    id => {
      const window = FINANCE_WINDOW_DEFINITIONS[id];
      expect(window.id).toBe(id);
      expect(window.current.length).toBeGreaterThan(0);
      expect(window.comparison.length).toBeGreaterThan(0);
      expect(window.minimumHistoryDays).toBeGreaterThanOrEqual(0);
    }
  );

  it('defaults shared creator context off and allowlists derived business values', () => {
    expect(FINANCE_SHARED_CREATOR_CONTEXT_DEFAULT).toBe('disabled');
    expect([...OWNER_OPT_IN_CREATOR_METRIC_IDS].sort()).toEqual([
      'creator_income_monthly',
      'creator_income_trailing_monthly',
      'creator_investment_spend',
      'creator_operating_burn',
    ]);
  });
});

describe('deterministic finance edge treatments', () => {
  const cases = [
    ['transfer', 'needs_review', 'Exclude both linked sides'],
    ['credit_card_payment', 'needs_review', 'Exclude the payment'],
    ['refund', 'needs_review', 'Offset the linked expense'],
    ['chargeback', 'needs_review', 'Reverse the linked income'],
    ['pending_transaction', 'include', 'Exclude until posted'],
    ['cash_withdrawal', 'needs_review', 'Treat as a transfer to cash'],
    ['debt', 'needs_review', 'Exclude borrowed principal'],
    ['savings', 'include', 'Exclude transfers'],
    ['reimbursement', 'needs_review', 'Offset the linked expense'],
    ['one_time_purchase', 'include', 'Include once'],
    ['annual_subscription', 'include', 'Include once'],
    ['irregular_royalty_income', 'include', 'Include posted creator income'],
    ['positive_cash_flow', 'include', 'Show the positive signed net value'],
    ['insufficient_history', 'insufficient_data', 'Show observed totals only'],
  ] as const;

  it.each(cases)('%s uses its canonical treatment', (id, state, actuals) => {
    expect(FINANCE_EDGE_CASES[id]).toMatchObject({
      id,
      unresolvedState: state,
    });
    expect(FINANCE_EDGE_CASES[id].actuals).toContain(actuals);
  });

  it('covers every required edge case exactly once', () => {
    expect(cases.map(([id]) => id)).toEqual(FINANCE_EDGE_CASE_IDS);
  });
});

describe('trend, target, and confidence semantics', () => {
  it.each([
    ['cash_available', 110, 100, 'increasing', 'favorable'],
    ['personal_essential_burn', 80, 100, 'decreasing', 'favorable'],
    ['creator_investment_spend', 120, 100, 'increasing', 'neutral'],
    ['net_cash_flow', 50, 0, 'increasing', 'favorable'],
  ] as const)(
    '%s evaluates direction and desired direction',
    (id, now, prior, direction, status) => {
      expect(evaluateFinanceTrend(id, now, prior)).toMatchObject({
        direction,
        status,
      });
    }
  );

  it.each([
    ['runway', 6, 6, 'met'],
    ['runway', 5.8, 6, 'near'],
    ['personal_essential_burn', 105, 100, 'near'],
    ['personal_essential_burn', 120, 100, 'missed'],
    ['cash_available', null, 100, 'unavailable'],
    ['cash_available', 100, null, 'not_set'],
  ] as const)('%s evaluates target status', (id, value, target, status) => {
    expect(evaluateFinanceTarget(id, value, target)).toBe(status);
  });

  it.each([
    [90, 0.95, 0.95, 24, 0, 10, 'high'],
    [30, 0.7, 0.8, 72, 1, 4, 'medium'],
    [10, 1, 1, 1, 0, 4, 'low'],
  ] as const)(
    'evaluates confidence from provenance quality',
    (historyDays, sourceCoverage, classifiedFraction, freshestBalanceAgeHours, unresolvedCount, postedCount, expected) => {
      expect(
        evaluateFinanceConfidence({
          historyDays,
          sourceCoverage,
          classifiedFraction,
          freshestBalanceAgeHours,
          unresolvedCount,
          postedCount,
        })
      ).toBe(expected);
    }
  );
});
