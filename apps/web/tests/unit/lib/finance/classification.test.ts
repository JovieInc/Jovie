import { describe, expect, it } from 'vitest';
import {
  type ClassificationInput,
  type ClassificationResult,
  classifyTransaction,
  deriveRuleFromCorrection,
  type FinanceDirection,
  type FinanceLens,
  needsReview,
  normalizeMerchant,
  type OwnerRule,
  reclassifyTransactions,
  validateSplitTotals,
} from '@/lib/finance/classification';

/**
 * Classification engine (JOV-4615): built-in patterns, owner-rule matching
 * and precedence, account defaults, corrections, splits, and review routing.
 */

const ACCOUNT_A = 'aaaaaaaa-1111-2222-3333-444444444444';
const ACCOUNT_B = 'bbbbbbbb-1111-2222-3333-444444444444';

const BUILTINS = {
  internal_transfer: {
    lens: 'internal_transfer',
    category: 'transfer',
    confidence: 0.9,
    explanation: 'Internal account-to-account transfer',
  },
  credit_card_payment: {
    lens: 'internal_transfer',
    category: 'credit_card_payment',
    confidence: 0.9,
    explanation:
      'Credit-card payment — excluded from income and burn to avoid double counting',
  },
  tax_payment: {
    lens: 'tax_reserve_movement',
    category: 'tax_payment',
    confidence: 0.9,
    explanation: 'Tax or reserve movement',
  },
  savings_debt: {
    lens: 'savings_debt_movement',
    category: 'savings_or_debt',
    confidence: 0.85,
    explanation: 'Savings or debt movement',
  },
  refund_adjustment: {
    lens: 'refund_adjustment',
    category: 'refund',
    confidence: 0.85,
    explanation: 'Refund, reimbursement, or adjustment',
  },
  cash_withdrawal: {
    lens: 'personal_discretionary_expense',
    category: 'cash_withdrawal',
    confidence: 0.6,
    explanation: 'Cash withdrawal — purpose unknown, review if material',
  },
  royalty_income: {
    lens: 'creator_income',
    category: 'royalty',
    confidence: 0.85,
    explanation: 'Royalty or distribution deposit',
  },
  processor_payout: {
    lens: 'creator_income',
    category: 'processor_payout',
    confidence: 0.7,
    explanation:
      'Payment-processor batch deposit — gross batch, not itemized sales',
  },
  equipment: {
    lens: 'creator_investment_expense',
    category: 'equipment',
    confidence: 0.6,
    explanation: 'Possible equipment purchase — confirm creator vs personal',
  },
  subscription_mixed: {
    lens: 'uncategorized',
    category: 'subscription',
    confidence: 0.4,
    explanation: 'Mixed-use subscription — owner should split or set a rule',
  },
  payroll_personal_income: {
    lens: 'personal_income',
    category: 'payroll',
    confidence: 0.85,
    explanation: 'Personal payroll income',
  },
} as const;

type BuiltinId = keyof typeof BUILTINS;

const FALLBACK: ClassificationResult = {
  lens: 'uncategorized',
  category: null,
  confidence: 0.2,
  explanation: 'No rule or deterministic pattern matched — review required',
  source: 'fallback',
  ruleId: null,
};

function expectBuiltin(result: ClassificationResult, id: BuiltinId) {
  expect(result).toEqual({
    ...BUILTINS[id],
    source: 'deterministic',
    ruleId: null,
  });
}

// Inflow = negative amount (money in), outflow = positive (money out).
const signed = (direction: FinanceDirection) =>
  direction === 'inflow' ? -100 : 100;

describe('classifyTransaction: deterministic patterns', () => {
  it.each<[string, FinanceDirection, BuiltinId]>([
    ['TRANSFER FROM CHECKING', 'inflow', 'internal_transfer'],
    ['ZELLE TO JANE', 'outflow', 'internal_transfer'],
    ['VENMO CASHOUT', 'inflow', 'internal_transfer'],
    ['VENMO TRANSFER', 'outflow', 'internal_transfer'],
    ['INTERNAL XFER 42', 'outflow', 'internal_transfer'],
    ['MOVE TO CHECKING', 'outflow', 'internal_transfer'],
    ['PAY TO CREDIT CARD', 'outflow', 'internal_transfer'],
    ['CREDIT CARD PAYMENT', 'outflow', 'credit_card_payment'],
    ['PAYMENT TO CHASE CARD', 'outflow', 'credit_card_payment'],
    ['PAYMENT TO AMERICAN EXPRESS', 'outflow', 'credit_card_payment'],
    ['PAYMENT TO CAPITAL ONE', 'outflow', 'credit_card_payment'],
    ['PAYMENT TO CITI', 'outflow', 'credit_card_payment'],
    ['DISCOVER AUTOPAY', 'outflow', 'credit_card_payment'],
    ['CC PAYMENT', 'outflow', 'credit_card_payment'],
    ['PAYMENT THANK YOU', 'inflow', 'credit_card_payment'],
    ['IRS', 'outflow', 'tax_payment'],
    ['US TREASURY 1040', 'outflow', 'tax_payment'],
    ['ESTIMATED TAX', 'outflow', 'tax_payment'],
    ['CA FRANCHISE TAX BD', 'outflow', 'tax_payment'],
    ['NY STATE TAX', 'outflow', 'tax_payment'],
    ['TAX PAYMENT', 'outflow', 'tax_payment'],
    ['QUARTERLY TAX', 'outflow', 'tax_payment'],
    ['SAVINGS DEPOSIT', 'outflow', 'savings_debt'],
    ['SAVINGS TRANSFER', 'outflow', 'internal_transfer'],
    ['LOAN PAYMENT', 'outflow', 'savings_debt'],
    ['NAVIENT STUDENT LOAN', 'outflow', 'savings_debt'],
    ['ROCKET MORTGAGE', 'outflow', 'savings_debt'],
    ['PRINCIPAL PAYMENT', 'outflow', 'savings_debt'],
    ['AMAZON REFUND', 'inflow', 'refund_adjustment'],
    ['EXPENSE REIMBURSEMENT', 'inflow', 'refund_adjustment'],
    ['CHARGEBACK', 'inflow', 'refund_adjustment'],
    ['FEE REVERSAL', 'inflow', 'refund_adjustment'],
    ['ADJUSTMENT', 'inflow', 'refund_adjustment'],
    ['STATEMENT CREDIT', 'inflow', 'refund_adjustment'],
    ['ATM 42ND ST', 'outflow', 'cash_withdrawal'],
    ['CASH WITHDRAWAL', 'outflow', 'cash_withdrawal'],
    ['BRANCH WITHDRAWAL', 'outflow', 'cash_withdrawal'],
    ['MECHANICAL ROYALTY', 'inflow', 'royalty_income'],
    ['ROYALTIES Q3', 'inflow', 'royalty_income'],
    ['SPOTIFY AB', 'inflow', 'royalty_income'],
    ['APPLE MUSIC', 'inflow', 'royalty_income'],
    ['DISTROKID', 'inflow', 'royalty_income'],
    ['TUNECORE', 'inflow', 'royalty_income'],
    ['ASCAP', 'inflow', 'royalty_income'],
    ['BMI', 'inflow', 'royalty_income'],
    ['SESAC', 'inflow', 'royalty_income'],
    ['SOUNDEXCHANGE', 'inflow', 'royalty_income'],
    ['YOUTUBE PAYOUT', 'inflow', 'royalty_income'],
    ['STRIPE', 'inflow', 'processor_payout'],
    ['PAYPAL', 'inflow', 'processor_payout'],
    ['SQUARE INC', 'inflow', 'processor_payout'],
    ['SHOPIFY', 'inflow', 'processor_payout'],
    ['GUMROAD', 'inflow', 'processor_payout'],
    ['PATREON', 'inflow', 'processor_payout'],
    ['KO-FI', 'inflow', 'processor_payout'],
    ['B&H PHOTO', 'outflow', 'equipment'],
    ['SWEETWATER', 'outflow', 'equipment'],
    ['GUITAR CENTER', 'outflow', 'equipment'],
    ['BEST BUY', 'outflow', 'equipment'],
    ['APPLE STORE', 'outflow', 'equipment'],
    ['CAMERA WORLD', 'outflow', 'equipment'],
    ['MICROPHONE SHOP', 'outflow', 'equipment'],
    ['ADOBE', 'outflow', 'subscription_mixed'],
    ['NOTION LABS', 'outflow', 'subscription_mixed'],
    ['GITHUB', 'outflow', 'subscription_mixed'],
    ['FIGMA', 'outflow', 'subscription_mixed'],
    ['CANVA', 'outflow', 'subscription_mixed'],
    ['DROPBOX', 'outflow', 'subscription_mixed'],
    ['GOOGLE WORKSPACE', 'outflow', 'subscription_mixed'],
    ['GOOGLE STORAGE', 'outflow', 'subscription_mixed'],
    ['GOOGLE ONE', 'outflow', 'subscription_mixed'],
    ['ACME PAYROLL', 'inflow', 'payroll_personal_income'],
    ['DIRECT DEP', 'inflow', 'payroll_personal_income'],
    ['SALARY', 'inflow', 'payroll_personal_income'],
    ['WAGES', 'inflow', 'payroll_personal_income'],
    ['EMPLOYER INC', 'inflow', 'payroll_personal_income'],
  ])('%s (%s) → %s', (description, direction, id) => {
    expectBuiltin(
      classifyTransaction({ amount: signed(direction), description }),
      id
    );
  });

  it('matches the provider category hint, case-insensitively', () => {
    expectBuiltin(
      classifyTransaction({
        amount: -100,
        merchantName: 'ACME',
        providerCategory: 'TRANSFER_IN',
      }),
      'internal_transfer'
    );
    expectBuiltin(
      classifyTransaction({
        amount: 100,
        providerCategory: 'transfer_between',
      }),
      'internal_transfer'
    );
  });

  it('matches across merchant name and description', () => {
    expectBuiltin(
      classifyTransaction({
        amount: -50,
        merchantName: 'Spotify',
        description: 'monthly statement',
      }),
      'royalty_income'
    );
  });

  it('applies earlier patterns first when several match', () => {
    // 'transfer' (internal_transfer) outranks 'stripe' (processor_payout).
    expectBuiltin(
      classifyTransaction({ amount: -1500, merchantName: 'STRIPE TRANSFER' }),
      'internal_transfer'
    );
  });

  it.each<[string, FinanceDirection]>([
    ['AMAZON REFUND', 'outflow'],
    ['ATM WITHDRAWAL', 'inflow'],
    ['SPOTIFY ROYALTIES', 'outflow'],
    ['STRIPE', 'outflow'],
    ['SWEETWATER', 'inflow'],
    ['ACME PAYROLL', 'outflow'],
  ])('direction-gated pattern %s does not fire on %s', (description, dir) => {
    expect(classifyTransaction({ amount: signed(dir), description })).toEqual(
      FALLBACK
    );
  });

  it('derives direction from the amount sign unless one is given', () => {
    // amount 0 is treated as an outflow.
    expectBuiltin(
      classifyTransaction({ amount: 0, description: 'SWEETWATER' }),
      'equipment'
    );
    expectBuiltin(
      classifyTransaction({
        amount: 100,
        description: 'AMAZON REFUND',
        direction: 'inflow',
      }),
      'refund_adjustment'
    );
    expect(
      classifyTransaction({
        amount: -100,
        description: 'AMAZON REFUND',
        direction: 'outflow',
      })
    ).toEqual(FALLBACK);
  });

  it('requires whole-word matches', () => {
    expect(
      classifyTransaction({ amount: 100, description: 'TRANSFERWISE FIRST' })
    ).toEqual(FALLBACK);
    expect(
      classifyTransaction({ amount: -100, description: 'STRIPED SHIRTS' })
    ).toEqual(FALLBACK);
  });
});

describe('classifyTransaction: account default and fallback', () => {
  it('applies a valid account default lens when nothing matches', () => {
    expect(
      classifyTransaction(
        { amount: 80, merchantName: 'RANDOM SHOP' },
        { accountDefaultLens: 'creator_operating_expense' }
      )
    ).toEqual({
      lens: 'creator_operating_expense',
      category: null,
      confidence: 0.5,
      explanation: 'Account-level default lens applied',
      source: 'account_default',
      ruleId: null,
    });
  });

  it.each([
    ['uncategorized', 'uncategorized'],
    ['unknown lens', 'not_a_lens'],
    ['empty', ''],
    ['null', null],
  ])('ignores an %s account default', (_label, accountDefaultLens) => {
    expect(
      classifyTransaction(
        { amount: 80, merchantName: 'RANDOM SHOP' },
        { accountDefaultLens }
      )
    ).toEqual(FALLBACK);
  });

  it('lets deterministic patterns beat the account default', () => {
    expectBuiltin(
      classifyTransaction(
        { amount: 100, description: 'IRS' },
        { accountDefaultLens: 'creator_operating_expense' }
      ),
      'tax_payment'
    );
  });

  it('falls back when there is no text at all', () => {
    expect(classifyTransaction({ amount: 22.5 })).toEqual(FALLBACK);
  });
});

describe('owner rules', () => {
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

  const ruleId = (input: ClassificationInput, rules: OwnerRule[]) =>
    classifyTransaction(input, { rules }).ruleId;

  it('returns the full rule result and beats deterministic patterns', () => {
    expect(
      classifyTransaction(base, {
        rules: [rule({ setCategory: 'software' })],
        accountDefaultLens: 'personal_income',
      })
    ).toEqual({
      lens: 'creator_operating_expense',
      category: 'software',
      confidence: 0.95,
      explanation: 'Owner rule "rule-1" matched',
      source: 'rule',
      ruleId: 'rule-1',
    });
    expect(
      classifyTransaction(base, { rules: [rule({})] }).category
    ).toBeNull();
  });

  it('picks the lowest priority number regardless of input order', () => {
    const rules = [
      rule({ id: 'b', priority: 50, setLens: 'personal_income' }),
      rule({ id: 'a', priority: 10 }),
      rule({ id: 'c', priority: 30 }),
    ];
    expect(ruleId(base, rules)).toBe('a');
    expect(ruleId(base, [...rules].reverse())).toBe('a');
  });

  it('ignores non-active rules', () => {
    expect(ruleId(base, [rule({ status: 'disabled' })])).toBeNull();
    expect(ruleId(base, [rule({ status: 'archived' })])).toBeNull();
  });

  it('skips an invalid-lens rule and keeps evaluating later rules', () => {
    expect(
      ruleId(base, [
        rule({ id: 'bad', priority: 1, setLens: 'not_a_lens' }),
        rule({ id: 'good', priority: 2 }),
      ])
    ).toBe('good');
  });

  it('scopes rules to an account', () => {
    expect(ruleId(base, [rule({ matchAccountId: ACCOUNT_B })])).toBeNull();
    expect(ruleId(base, [rule({ matchAccountId: ACCOUNT_A })])).toBe('rule-1');
    expect(
      ruleId({ ...base, accountId: undefined }, [
        rule({ matchAccountId: ACCOUNT_A }),
      ])
    ).toBeNull();
  });

  it('matches the explicit or sign-derived direction', () => {
    expect(ruleId(base, [rule({ matchDirection: 'inflow' })])).toBeNull();
    expect(ruleId(base, [rule({ matchDirection: 'outflow' })])).toBe('rule-1');
    expect(
      ruleId({ ...base, direction: undefined, amount: -60 }, [
        rule({ matchDirection: 'inflow' }),
      ])
    ).toBe('rule-1');
  });

  it.each([
    { amount: 9.995, min: 10, matches: true },
    { amount: 9.994, min: 10, matches: false },
    { amount: -9.995, min: 10, matches: true },
    { amount: 10.005, max: 10, matches: true },
    { amount: 10.006, max: 10, matches: false },
    { amount: -10.006, max: 10, matches: false },
    { amount: 0, min: 0, max: 0, matches: true },
  ])(
    'amount $amount within [min=$min, max=$max] ±0.005 → $matches',
    ({ amount, min, max, matches }) => {
      expect(
        ruleId({ ...base, amount }, [
          rule({ matchAmountMin: min ?? null, matchAmountMax: max ?? null }),
        ])
      ).toBe(matches ? 'rule-1' : null);
    }
  );

  it('matches recurrence scopes', () => {
    const recurring = rule({ matchRecurrence: 'recurring' });
    const oneTime = rule({ matchRecurrence: 'one_time' });
    expect(ruleId(base, [recurring])).toBeNull();
    expect(ruleId({ ...base, recurring: true }, [recurring])).toBe('rule-1');
    expect(ruleId(base, [oneTime])).toBe('rule-1');
    expect(ruleId({ ...base, recurring: true }, [oneTime])).toBeNull();
  });

  it('normalizes the merchant pattern and searches all text fields', () => {
    expect(
      ruleId(base, [rule({ matchMerchantPattern: 'ADOBE  CREATIVE!' })])
    ).toBe('rule-1');
    expect(
      ruleId({ ...base, merchantName: 'X', description: 'adobe inc' }, [
        rule({}),
      ])
    ).toBe('rule-1');
    expect(
      ruleId(base, [rule({ matchMerchantPattern: 'netflix' })])
    ).toBeNull();
    // A pattern that normalizes to nothing does not constrain the match.
    expect(ruleId(base, [rule({ matchMerchantPattern: '***' })])).toBe(
      'rule-1'
    );
  });

  it('requires every non-empty description token', () => {
    const tokens = (matchDescriptionTokens: string[]) =>
      rule({ matchMerchantPattern: null, matchDescriptionTokens });
    expect(ruleId(base, [tokens(['adobe', 'cloud'])])).toBe('rule-1');
    expect(ruleId(base, [tokens(['adobe', 'systems'])])).toBeNull();
    expect(ruleId(base, [tokens(['ADOBE', '', '!!'])])).toBe('rule-1');
    expect(ruleId(base, [tokens([])])).toBe('rule-1');
  });
});

describe('reclassifyTransactions', () => {
  it('returns one result per transaction keyed by the input object', () => {
    const txns: ClassificationInput[] = [
      { amount: 15.99, merchantName: 'NETFLIX.COM', direction: 'outflow' },
      { amount: 100, description: 'IRS' },
      { amount: 1, merchantName: 'UNKNOWN' },
    ];
    const rules: OwnerRule[] = [
      {
        id: 'derived-1',
        status: 'active',
        priority: 100,
        matchMerchantPattern: 'netflix com',
        setLens: 'personal_discretionary_expense',
      },
    ];
    const out = reclassifyTransactions(txns, { rules });
    expect(out.size).toBe(3);
    expect(out.get(txns[0])?.ruleId).toBe('derived-1');
    expect(out.get(txns[1])?.category).toBe('tax_payment');
    expect(out.get(txns[2])).toEqual(FALLBACK);
    expect(reclassifyTransactions([], { rules }).size).toBe(0);
  });
});

describe('deriveRuleFromCorrection', () => {
  it('builds a rule from safe fields only', () => {
    expect(
      deriveRuleFromCorrection(
        {
          transactionId: 'tx-1',
          accountId: ACCOUNT_A,
          amount: 15.99,
          merchantName: 'Netflix.com',
          description: 'secret memo',
          direction: 'outflow',
        },
        {
          lens: 'personal_discretionary_expense',
          category: 'streaming',
          scopeToAccount: true,
          amountRange: { min: 10, max: 20 },
          applyToRecurringOnly: true,
        }
      )
    ).toEqual({
      name: 'Owner correction: netflix com',
      matchAccountId: ACCOUNT_A,
      matchMerchantPattern: 'netflix com',
      matchDirection: 'outflow',
      matchAmountMin: 10,
      matchAmountMax: 20,
      matchRecurrence: 'recurring',
      setLens: 'personal_discretionary_expense',
      setCategory: 'streaming',
      provenance: 'owner_correction',
      sourceTransactionId: 'tx-1',
    });
  });

  it('defaults every optional scope to null', () => {
    expect(
      deriveRuleFromCorrection(
        { amount: -5, accountId: ACCOUNT_A },
        { lens: 'personal_income' }
      )
    ).toEqual({
      name: 'Owner correction',
      matchAccountId: null,
      matchMerchantPattern: null,
      matchDirection: 'inflow',
      matchAmountMin: null,
      matchAmountMax: null,
      matchRecurrence: null,
      setLens: 'personal_income',
      setCategory: null,
      provenance: 'owner_correction',
      sourceTransactionId: null,
    });
  });

  it('uses null for an account-scoped correction without an account', () => {
    expect(
      deriveRuleFromCorrection(
        { amount: 5 },
        { lens: 'personal_income', scopeToAccount: true }
      ).matchAccountId
    ).toBeNull();
  });
});

describe('validateSplitTotals', () => {
  it('accepts splits that sum to the parent within half a cent', () => {
    expect(() =>
      validateSplitTotals(100, [
        { amount: 60, lens: 'creator_operating_expense' },
        { amount: 40, lens: 'personal_discretionary_expense' },
      ])
    ).not.toThrow();
    expect(() =>
      validateSplitTotals(100, [{ amount: 100.005, lens: 'uncategorized' }])
    ).not.toThrow();
    expect(() =>
      validateSplitTotals(-50, [
        { amount: -20, lens: 'refund_adjustment' },
        { amount: -30, lens: 'refund_adjustment' },
      ])
    ).not.toThrow();
  });

  it('rejects mismatched totals with both amounts in the message', () => {
    expect(() =>
      validateSplitTotals(100, [
        { amount: 60, lens: 'creator_operating_expense' },
        { amount: 30, lens: 'personal_discretionary_expense' },
      ])
    ).toThrow(
      new Error(
        'Split total 90.0000 does not equal transaction amount 100.0000'
      )
    );
    expect(() =>
      validateSplitTotals(100, [{ amount: 100.006, lens: 'uncategorized' }])
    ).toThrow(/does not equal/);
    expect(() =>
      validateSplitTotals(100, [{ amount: 99.994, lens: 'uncategorized' }])
    ).toThrow(/does not equal/);
  });

  it('rejects empty splits and invalid lenses', () => {
    expect(() => validateSplitTotals(100, [])).toThrow(
      new Error('Split requires at least one line')
    );
    expect(() =>
      validateSplitTotals(100, [
        { amount: 50, lens: 'uncategorized' },
        { amount: 50, lens: 'bogus' as FinanceLens },
      ])
    ).toThrow(new Error('Invalid split lens: bogus'));
  });
});

describe('needsReview', () => {
  const result = (
    lens: FinanceLens,
    confidence: number
  ): ClassificationResult => ({
    lens,
    category: null,
    confidence,
    explanation: '',
    source: 'deterministic',
    ruleId: null,
  });

  it.each([
    { amount: 50, lens: 'uncategorized', confidence: 0.99, review: true },
    { amount: 50, lens: 'personal_income', confidence: 0.59, review: true },
    { amount: 50, lens: 'personal_income', confidence: 0.6, review: false },
    { amount: 1000, lens: 'creator_income', confidence: 0.79, review: true },
    { amount: -1000, lens: 'creator_income', confidence: 0.79, review: true },
    { amount: 999.99, lens: 'creator_income', confidence: 0.79, review: false },
    { amount: 1000, lens: 'creator_income', confidence: 0.8, review: false },
  ] as const)(
    'amount $amount, $lens @ $confidence → $review',
    ({ amount, lens, confidence, review }) => {
      expect(needsReview({ amount }, result(lens, confidence))).toBe(review);
    }
  );
});

describe('normalizeMerchant', () => {
  it.each([
    ['STRIPE PAYOUT 1234', 'stripe payout 1234'],
    ["McDonald's #4402", 'mcdonald s 4402'],
    ['POS SQ *COFFEE  SHOP', 'coffee shop'],
    ['TST* Pizza SP CHKCARD', 'pizza'],
    ['SPOT POSTER', 'spot poster'],
    ['', ''],
    [null, ''],
    [undefined, ''],
  ])('normalizeMerchant(%j) → %j', (raw, expected) => {
    expect(normalizeMerchant(raw)).toBe(expected);
  });
});
