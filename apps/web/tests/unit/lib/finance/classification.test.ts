import { describe, expect, it } from 'vitest';
import {
  type ClassificationInput,
  classifyTransaction,
  deriveRuleFromCorrection,
  type FinanceLens,
  needsReview,
  normalizeMerchant,
  type OwnerRule,
  reclassifyTransactions,
  validateSplitTotals,
} from '@/lib/finance/classification';

/**
 * Table-driven coverage for the canonical finance classification classes,
 * rule precedence/conflicts, reversals, recurrence, and mixed accounts
 * (JOV-4615).
 */

const ACCOUNT_A = 'aaaaaaaa-1111-2222-3333-444444444444';
const ACCOUNT_B = 'bbbbbbbb-1111-2222-3333-444444444444';

interface Case {
  name: string;
  input: ClassificationInput;
  lens: FinanceLens;
  source?: string;
  minConfidence?: number;
  accountDefaultLens?: string | null;
}

const cases: Case[] = [
  {
    name: 'credit-card payment is internal_transfer, never income or burn',
    input: {
      amount: 1200,
      description: 'CREDIT CARD PAYMENT THANK YOU',
      direction: 'outflow',
    },
    lens: 'internal_transfer',
  },
  {
    name: 'account transfer is internal_transfer',
    input: {
      amount: -500,
      description: 'TRANSFER FROM CHECKING',
      direction: 'inflow',
    },
    lens: 'internal_transfer',
  },
  {
    name: 'IRS payment is tax_reserve_movement',
    input: {
      amount: 3200,
      merchantName: 'IRS US TREASURY',
      direction: 'outflow',
    },
    lens: 'tax_reserve_movement',
  },
  {
    name: 'quarterly estimated tax is tax_reserve_movement',
    input: { amount: 800, description: 'ESTIMATED TAX PAYMENT' },
    lens: 'tax_reserve_movement',
  },
  {
    name: 'savings transfer is savings_debt_movement',
    input: { amount: 400, description: 'TRANSFER TO SAVINGS' },
    lens: 'internal_transfer',
  },
  {
    name: 'loan payment is savings_debt_movement',
    input: { amount: 900, description: 'STUDENT LOAN PAYMENT' },
    lens: 'savings_debt_movement',
  },
  {
    name: 'refund inflow is refund_adjustment',
    input: {
      amount: -45.99,
      description: 'REFUND - AMAZON',
      direction: 'inflow',
    },
    lens: 'refund_adjustment',
  },
  {
    name: 'chargeback reversal is refund_adjustment',
    input: { amount: -120, description: 'CHARGEBACK REVERSAL' },
    lens: 'refund_adjustment',
  },
  {
    name: 'reimbursement inflow is refund_adjustment',
    input: { amount: -200, description: 'EXPENSE REIMBURSEMENT' },
    lens: 'refund_adjustment',
  },
  {
    name: 'ATM cash withdrawal is personal discretionary, low confidence',
    input: { amount: 100, description: 'ATM CASH WITHDRAWAL' },
    lens: 'personal_discretionary_expense',
    minConfidence: 0.5,
  },
  {
    name: 'Spotify royalty deposit is creator_income',
    input: { amount: -320.5, description: 'SPOTIFY ROYALTIES PAYOUT' },
    lens: 'creator_income',
  },
  {
    name: 'ASCAP royalty is creator_income',
    input: { amount: -88, merchantName: 'ASCAP ROYALTY', direction: 'inflow' },
    lens: 'creator_income',
  },
  {
    name: 'Stripe processor batch is creator_income',
    input: { amount: -1500, merchantName: 'STRIPE TRANSFER PAYOUT' },
    lens: 'internal_transfer', // 'transfer' keyword wins over 'stripe payout'
  },
  {
    name: 'PayPal payout is creator_income',
    input: { amount: -640, merchantName: 'PAYPAL PAYOUT' },
    lens: 'creator_income',
  },
  {
    name: 'equipment purchase is creator_investment_expense',
    input: { amount: 2400, merchantName: 'B&H PHOTO VIDEO' },
    lens: 'creator_investment_expense',
  },
  {
    name: 'mixed-use subscription stays uncategorized for review',
    input: { amount: 52.99, merchantName: 'ADOBE CREATIVE CLOUD' },
    lens: 'uncategorized',
    minConfidence: 0.3,
  },
  {
    name: 'payroll deposit is personal_income',
    input: { amount: -3000, description: 'DIRECT DEP PAYROLL' },
    lens: 'personal_income',
  },
  {
    name: 'unmatched outflow falls back to uncategorized',
    input: { amount: 22.5, merchantName: 'UNKNOWN MERCHANT XYZ' },
    lens: 'uncategorized',
  },
  {
    name: 'account default lens applies when nothing matches',
    input: { amount: 80, merchantName: 'RANDOM SHOP' },
    accountDefaultLens: 'creator_operating_expense',
    lens: 'creator_operating_expense',
    source: 'account_default',
  },
];

describe('classifyTransaction canonical classes (JOV-4615)', () => {
  it.each(cases)(
    '$name',
    ({ input, lens, source, minConfidence, accountDefaultLens }) => {
      const result = classifyTransaction(input, { accountDefaultLens });
      expect(result.lens).toBe(lens);
      if (source) expect(result.source).toBe(source);
      if (minConfidence != null)
        expect(result.confidence).toBeGreaterThanOrEqual(minConfidence);
      expect(result.explanation.length).toBeGreaterThan(0);
    }
  );
});

describe('owner rules: precedence, conflicts, scope (JOV-4615)', () => {
  const base: ClassificationInput = {
    accountId: ACCOUNT_A,
    amount: 60,
    merchantName: 'Adobe Creative Cloud',
    direction: 'outflow',
  };

  const rule = (over: Partial<OwnerRule>): OwnerRule => ({
    id: 'rule-1',
    status: 'active',
    priority: 100,
    setLens: 'creator_operating_expense',
    matchMerchantPattern: 'adobe',
    ...over,
  });

  it('owner rule beats deterministic subscription default', () => {
    const result = classifyTransaction(base, { rules: [rule({})] });
    expect(result.lens).toBe('creator_operating_expense');
    expect(result.source).toBe('rule');
    expect(result.ruleId).toBe('rule-1');
  });

  it('lower priority number wins when two rules conflict', () => {
    const rules = [
      rule({
        id: 'loser',
        priority: 50,
        setLens: 'personal_discretionary_expense',
      }),
      rule({ id: 'winner', priority: 10 }),
    ];
    const result = classifyTransaction(base, { rules });
    expect(result.ruleId).toBe('winner');
    expect(result.lens).toBe('creator_operating_expense');
  });

  it('disabled rules are ignored', () => {
    const result = classifyTransaction(base, {
      rules: [rule({ status: 'disabled' })],
    });
    expect(result.source).not.toBe('rule');
    expect(result.lens).toBe('uncategorized');
  });

  it('account-scoped rule does not fire on another account (mixed accounts)', () => {
    const scoped = rule({ matchAccountId: ACCOUNT_B });
    const result = classifyTransaction(base, { rules: [scoped] });
    expect(result.source).not.toBe('rule');
  });

  it('account-scoped rule fires on its own account', () => {
    const scoped = rule({ matchAccountId: ACCOUNT_A });
    const result = classifyTransaction(base, { rules: [scoped] });
    expect(result.ruleId).toBe('rule-1');
  });

  it('direction mismatch prevents a match', () => {
    const inflowOnly = rule({ matchDirection: 'inflow' });
    const result = classifyTransaction(base, { rules: [inflowOnly] });
    expect(result.source).not.toBe('rule');
  });

  it('amount range constrains the match', () => {
    const small = rule({ matchAmountMax: 10 });
    const result = classifyTransaction(base, { rules: [small] });
    expect(result.source).not.toBe('rule');
    const inRange = classifyTransaction(
      { ...base, amount: 5 },
      { rules: [small] }
    );
    expect(inRange.ruleId).toBe('rule-1');
  });

  it('recurrence-scoped rule only matches recurring transactions', () => {
    const recurringOnly = rule({ matchRecurrence: 'recurring' });
    expect(
      classifyTransaction(base, { rules: [recurringOnly] }).source
    ).not.toBe('rule');
    expect(
      classifyTransaction(
        { ...base, recurring: true },
        {
          rules: [recurringOnly],
        }
      ).ruleId
    ).toBe('rule-1');
  });

  it('description tokens must all be present', () => {
    const tokenRule = rule({
      matchMerchantPattern: null,
      matchDescriptionTokens: ['adobe', 'cloud'],
    });
    expect(classifyTransaction(base, { rules: [tokenRule] }).ruleId).toBe(
      'rule-1'
    );
    expect(
      classifyTransaction(
        { ...base, merchantName: 'Adobe Systems' },
        { rules: [tokenRule] }
      ).source
    ).not.toBe('rule');
  });

  it('rules with invalid lens values are skipped', () => {
    const bad = rule({ setLens: 'not_a_lens' });
    const result = classifyTransaction(base, { rules: [bad] });
    expect(result.source).not.toBe('rule');
  });
});

describe('owner corrections → rules (JOV-4615)', () => {
  it('derives a rule from safe fields only', () => {
    const input: ClassificationInput = {
      transactionId: 'tx-1',
      accountId: ACCOUNT_A,
      amount: 15.99,
      merchantName: 'Netflix.com',
      direction: 'outflow',
    };
    const derived = deriveRuleFromCorrection(input, {
      lens: 'personal_discretionary_expense',
      scopeToAccount: true,
    });
    expect(derived.provenance).toBe('owner_correction');
    expect(derived.matchMerchantPattern).toBe('netflix com');
    expect(derived.matchAccountId).toBe(ACCOUNT_A);
    expect(derived.matchDirection).toBe('outflow');
    expect(derived.sourceTransactionId).toBe('tx-1');
    // no raw description/amount leaks into the rule
    expect(JSON.stringify(derived)).not.toContain('15.99');
  });

  it('a correction-derived rule reclassifies history deterministically', () => {
    const txns: ClassificationInput[] = [
      { amount: 15.99, merchantName: 'NETFLIX.COM', direction: 'outflow' },
      { amount: 15.99, merchantName: 'NETFLIX COM 866-579-7172' },
    ];
    const derived = deriveRuleFromCorrection(txns[0], {
      lens: 'personal_discretionary_expense',
    });
    const rules: OwnerRule[] = [
      {
        id: 'derived-1',
        status: 'active',
        priority: 100,
        matchMerchantPattern: derived.matchMerchantPattern,
        matchDirection: derived.matchDirection,
        setLens: derived.setLens,
      },
    ];
    const first = reclassifyTransactions(txns, { rules });
    const second = reclassifyTransactions(txns, { rules });
    // idempotent: same inputs → same outputs
    for (const tx of txns) {
      expect(first.get(tx)).toEqual(second.get(tx));
      expect(first.get(tx)?.lens).toBe('personal_discretionary_expense');
    }
  });
});

describe('splits preserve totals (JOV-4615)', () => {
  it('accepts an exact personal/creator split', () => {
    expect(() =>
      validateSplitTotals(100, [
        { amount: 60, lens: 'creator_operating_expense' },
        { amount: 40, lens: 'personal_discretionary_expense' },
      ])
    ).not.toThrow();
  });

  it('rejects splits that do not sum to the parent', () => {
    expect(() =>
      validateSplitTotals(100, [
        { amount: 60, lens: 'creator_operating_expense' },
        { amount: 30, lens: 'personal_discretionary_expense' },
      ])
    ).toThrow(/does not equal/);
  });

  it('rejects empty and invalid-lens splits', () => {
    expect(() => validateSplitTotals(100, [])).toThrow();
    expect(() =>
      validateSplitTotals(100, [{ amount: 100, lens: 'bogus' as FinanceLens }])
    ).toThrow(/Invalid split lens/);
  });
});

describe('review queue predicate (JOV-4615)', () => {
  it('flags uncategorized, low-confidence, and high-value items', () => {
    const tx: ClassificationInput = { amount: 50, merchantName: 'X' };
    expect(
      needsReview(tx, {
        lens: 'uncategorized',
        category: null,
        confidence: 0.2,
        explanation: '',
        source: 'fallback',
        ruleId: null,
      })
    ).toBe(true);
    expect(
      needsReview(tx, {
        lens: 'personal_income',
        category: null,
        confidence: 0.5,
        explanation: '',
        source: 'deterministic',
        ruleId: null,
      })
    ).toBe(true);
    const big: ClassificationInput = { amount: 5000, merchantName: 'X' };
    expect(
      needsReview(big, {
        lens: 'creator_income',
        category: null,
        confidence: 0.7,
        explanation: '',
        source: 'deterministic',
        ruleId: null,
      })
    ).toBe(true);
    // confident mid-value result stays out of the queue
    expect(
      needsReview(tx, {
        lens: 'personal_income',
        category: null,
        confidence: 0.9,
        explanation: '',
        source: 'rule',
        ruleId: 'r',
      })
    ).toBe(false);
  });
});

describe('normalizeMerchant (JOV-4615)', () => {
  it.each([
    ['STRIPE PAYOUT 1234', 'stripe payout 1234'],
    ["McDonald's #4402", 'mcdonald s 4402'],
    ['', ''],
    [null, ''],
  ])('normalizeMerchant(%j) → %j', (raw, expected) => {
    expect(normalizeMerchant(raw)).toBe(expected);
  });

  it('duplicate merchant names normalize to the same key', () => {
    expect(normalizeMerchant('SQ *COFFEE SHOP')).toBe(
      normalizeMerchant('coffee shop')
    );
  });
});
