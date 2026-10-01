/**
 * Owner-scoped transaction classification engine (JOV-4615).
 *
 * Pure, deterministic classification over normalized finance transactions.
 * Deterministic built-in patterns run first; owner rules (derived from
 * corrections) override them; an optional account default lens is the last
 * resort before `uncategorized`. Model assistance is intentionally NOT wired
 * here — a model path may only plug in behind a typed, auditable contract
 * and must never receive more than the minimum owner-scoped fields.
 *
 * Sign convention: the normalized ledger stores Plaid-style signed amounts —
 * positive = money out of the account (outflow), negative = money in
 * (inflow). Callers may pass an explicit `direction` to override.
 *
 * A `creator_*` lens is a label only. It never implies sharing: all finance
 * rows remain private owner data regardless of classification.
 */

export const FINANCE_LENSES = [
  'personal_income',
  'personal_essential_expense',
  'personal_discretionary_expense',
  'creator_income',
  'creator_operating_expense',
  'creator_investment_expense',
  'tax_reserve_movement',
  'savings_debt_movement',
  'internal_transfer',
  'refund_adjustment',
  'uncategorized',
] as const;

export type FinanceLens = (typeof FINANCE_LENSES)[number];

export const FINANCE_DIRECTIONS = ['inflow', 'outflow'] as const;
export type FinanceDirection = (typeof FINANCE_DIRECTIONS)[number];

export type ClassificationSource =
  | 'rule'
  | 'deterministic'
  | 'owner'
  | 'model'
  | 'account_default'
  | 'fallback';

export interface ClassificationInput {
  transactionId?: string;
  accountId?: string;
  amount: number;
  merchantName?: string | null;
  description?: string | null;
  /** Plaid/provider category hint, e.g. "TRANSFER_IN". */
  providerCategory?: string | null;
  direction?: FinanceDirection;
  recurring?: boolean;
}

export interface ClassificationResult {
  lens: FinanceLens;
  category: string | null;
  confidence: number;
  explanation: string;
  source: ClassificationSource;
  ruleId: string | null;
}

/** Subset of finance_classification_rules the matcher needs. */
export interface OwnerRule {
  id: string;
  status: string;
  priority: number;
  matchAccountId?: string | null;
  matchMerchantPattern?: string | null;
  matchDirection?: string | null;
  matchAmountMin?: number | null;
  matchAmountMax?: number | null;
  matchDescriptionTokens?: string[] | null;
  matchRecurrence?: string | null;
  setLens: string;
  setCategory?: string | null;
}

const AMOUNT_TOLERANCE = 0.005;

/** Normalize a merchant name to a stable lowercase token form. */
export function normalizeMerchant(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(pos|sq|tst|sp|chkcard)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function haystack(input: ClassificationInput): string {
  return `${normalizeMerchant(input.merchantName)} ${normalizeMerchant(
    input.description
  )} ${(input.providerCategory ?? '').toLowerCase()}`.trim();
}

function directionOf(input: ClassificationInput): FinanceDirection {
  if (input.direction) return input.direction;
  return input.amount < 0 ? 'inflow' : 'outflow';
}

interface BuiltinPattern {
  id: string;
  lens: FinanceLens;
  category: string;
  direction?: FinanceDirection;
  patterns: RegExp[];
  confidence: number;
  explanation: string;
}

/**
 * Deterministic first-pass patterns, ordered most-specific first. These
 * deliberately classify transfers and card payments as `internal_transfer`
 * so they never inflate income or burn.
 */
const BUILTIN_PATTERNS: BuiltinPattern[] = [
  {
    id: 'internal_transfer',
    lens: 'internal_transfer',
    category: 'transfer',
    patterns: [
      /\btransfer\b/,
      /\btransfer_(in|out|between)\b/,
      /\bzelle\b/,
      /\bvenmo (transfer|cashout)\b/,
      /\binternal xfer\b/,
      /\bto (checking|savings|credit card)\b/,
    ],
    confidence: 0.9,
    explanation: 'Internal account-to-account transfer',
  },
  {
    id: 'credit_card_payment',
    lens: 'internal_transfer',
    category: 'credit_card_payment',
    patterns: [
      /\bcredit card payment\b/,
      /\bpayment to (chase|amex|american express|discover|capital one|citi)/,
      /\bautopay\b/,
      /\bcc payment\b/,
      /\bpayment thank you\b/,
    ],
    confidence: 0.9,
    explanation:
      'Credit-card payment — excluded from income and burn to avoid double counting',
  },
  {
    id: 'tax_payment',
    lens: 'tax_reserve_movement',
    category: 'tax_payment',
    patterns: [
      /\birs\b/,
      /\bus treasury\b/,
      /\bestimated tax\b/,
      /\bfranchise tax\b/,
      /\bstate tax\b/,
      /\btax payment\b/,
      /\bquarterly tax\b/,
    ],
    confidence: 0.9,
    explanation: 'Tax or reserve movement',
  },
  {
    id: 'savings_debt',
    lens: 'savings_debt_movement',
    category: 'savings_or_debt',
    patterns: [
      /\bto savings\b/,
      /\bsavings (deposit|transfer)\b/,
      /\bloan payment\b/,
      /\bstudent loan\b/,
      /\bmortgage\b/,
      /\bprincipal payment\b/,
    ],
    confidence: 0.85,
    explanation: 'Savings or debt movement',
  },
  {
    id: 'refund_adjustment',
    lens: 'refund_adjustment',
    category: 'refund',
    direction: 'inflow',
    patterns: [
      /\brefund\b/,
      /\breimbursement\b/,
      /\bchargeback\b/,
      /\breversal\b/,
      /\badjustment\b/,
      /\bcredit\b/,
    ],
    confidence: 0.85,
    explanation: 'Refund, reimbursement, or adjustment',
  },
  {
    id: 'cash_withdrawal',
    lens: 'personal_discretionary_expense',
    category: 'cash_withdrawal',
    direction: 'outflow',
    patterns: [/\batm\b/, /\bcash withdrawal\b/, /\bwithdrawal\b/],
    confidence: 0.6,
    explanation: 'Cash withdrawal — purpose unknown, review if material',
  },
  {
    id: 'royalty_income',
    lens: 'creator_income',
    category: 'royalty',
    direction: 'inflow',
    patterns: [
      /\broyalt(y|ies)\b/,
      /\bspotify\b/,
      /\bapple music\b/,
      /\bdistrokid\b/,
      /\btunecore\b/,
      /\bascap\b/,
      /\bbmi\b/,
      /\bsesac\b/,
      /\bsoundexchange\b/,
      /\bpayout\b/,
    ],
    confidence: 0.85,
    explanation: 'Royalty or distribution deposit',
  },
  {
    id: 'processor_payout',
    lens: 'creator_income',
    category: 'processor_payout',
    direction: 'inflow',
    patterns: [
      /\bstripe\b/,
      /\bpaypal\b/,
      /\bsquare\b/,
      /\bshopify\b/,
      /\bgumroad\b/,
      /\bpatreon\b/,
      /\bko fi\b/,
    ],
    confidence: 0.7,
    explanation:
      'Payment-processor batch deposit — gross batch, not itemized sales',
  },
  {
    id: 'equipment',
    lens: 'creator_investment_expense',
    category: 'equipment',
    direction: 'outflow',
    patterns: [
      /\bb h photo\b/,
      /\bsweetwater\b/,
      /\bguitar center\b/,
      /\bbest buy\b/,
      /\bapple store\b/,
      /\bcamera\b/,
      /\bmicrophone\b/,
    ],
    confidence: 0.6,
    explanation: 'Possible equipment purchase — confirm creator vs personal',
  },
  {
    id: 'subscription_mixed',
    lens: 'uncategorized',
    category: 'subscription',
    patterns: [
      /\badobe\b/,
      /\bnotion\b/,
      /\bgithub\b/,
      /\bfigma\b/,
      /\bcanva\b/,
      /\bdropbox\b/,
      /\bgoogle (workspace|storage|one)\b/,
    ],
    confidence: 0.4,
    explanation: 'Mixed-use subscription — owner should split or set a rule',
  },
  {
    id: 'payroll_personal_income',
    lens: 'personal_income',
    category: 'payroll',
    direction: 'inflow',
    patterns: [
      /\bpayroll\b/,
      /\bdirect dep\b/,
      /\bsalary\b/,
      /\bwages\b/,
      /\bemployer\b/,
    ],
    confidence: 0.85,
    explanation: 'Personal payroll income',
  },
];

function matchOwnerRule(
  input: ClassificationInput,
  rules: OwnerRule[]
): OwnerRule | null {
  const dir = directionOf(input);
  const text = haystack(input);
  const absAmount = Math.abs(input.amount);

  const active = rules
    .filter(r => r.status === 'active')
    .sort((a, b) => a.priority - b.priority);

  for (const rule of active) {
    if (!FINANCE_LENSES.includes(rule.setLens as FinanceLens)) continue;
    if (rule.matchAccountId && rule.matchAccountId !== input.accountId)
      continue;
    if (rule.matchDirection && rule.matchDirection !== dir) continue;
    if (
      rule.matchAmountMin != null &&
      absAmount < rule.matchAmountMin - AMOUNT_TOLERANCE
    )
      continue;
    if (
      rule.matchAmountMax != null &&
      absAmount > rule.matchAmountMax + AMOUNT_TOLERANCE
    )
      continue;
    if (
      rule.matchRecurrence &&
      rule.matchRecurrence !== (input.recurring ? 'recurring' : 'one_time')
    )
      continue;
    if (rule.matchMerchantPattern) {
      const pat = normalizeMerchant(rule.matchMerchantPattern);
      if (pat && !text.includes(pat)) continue;
    }
    if (rule.matchDescriptionTokens?.length) {
      const tokens = rule.matchDescriptionTokens.map(normalizeMerchant);
      if (!tokens.every(t => !t || text.includes(t))) continue;
    }
    return rule;
  }
  return null;
}

export interface ClassifyContext {
  rules?: OwnerRule[];
  accountDefaultLens?: string | null;
}

/**
 * Classify one transaction. Precedence: owner rules (priority order) →
 * deterministic built-in patterns → account default lens → uncategorized.
 */
export function classifyTransaction(
  input: ClassificationInput,
  ctx: ClassifyContext = {}
): ClassificationResult {
  const rule = matchOwnerRule(input, ctx.rules ?? []);
  if (rule) {
    return {
      lens: rule.setLens as FinanceLens,
      category: rule.setCategory ?? null,
      confidence: 0.95,
      explanation: `Owner rule "${rule.id}" matched`,
      source: 'rule',
      ruleId: rule.id,
    };
  }

  const dir = directionOf(input);
  const text = haystack(input);
  for (const pattern of BUILTIN_PATTERNS) {
    if (pattern.direction && pattern.direction !== dir) continue;
    if (pattern.patterns.some(re => re.test(text))) {
      return {
        lens: pattern.lens,
        category: pattern.category,
        confidence: pattern.confidence,
        explanation: pattern.explanation,
        source: 'deterministic',
        ruleId: null,
      };
    }
  }

  if (
    ctx.accountDefaultLens &&
    FINANCE_LENSES.includes(ctx.accountDefaultLens as FinanceLens) &&
    ctx.accountDefaultLens !== 'uncategorized'
  ) {
    return {
      lens: ctx.accountDefaultLens as FinanceLens,
      category: null,
      confidence: 0.5,
      explanation: 'Account-level default lens applied',
      source: 'account_default',
      ruleId: null,
    };
  }

  return {
    lens: 'uncategorized',
    category: null,
    confidence: 0.2,
    explanation: 'No rule or deterministic pattern matched — review required',
    source: 'fallback',
    ruleId: null,
  };
}

/** Batch reclassification — pure and idempotent over a transaction list. */
export function reclassifyTransactions<T extends ClassificationInput>(
  transactions: T[],
  ctx: ClassifyContext
): Map<T, ClassificationResult> {
  const out = new Map<T, ClassificationResult>();
  for (const tx of transactions) {
    out.set(tx, classifyTransaction(tx, ctx));
  }
  return out;
}

/** Safe fields an owner correction may compile into a reusable rule. */
export interface OwnerCorrection {
  lens: FinanceLens;
  category?: string | null;
  /** Restrict the derived rule to this account. */
  scopeToAccount?: boolean;
  /** Restrict the derived rule to this amount range. */
  amountRange?: { min: number; max: number } | null;
  applyToRecurringOnly?: boolean;
}

export interface DerivedRule {
  name: string;
  matchAccountId: string | null;
  matchMerchantPattern: string | null;
  matchDirection: FinanceDirection;
  matchAmountMin: number | null;
  matchAmountMax: number | null;
  matchRecurrence: string | null;
  setLens: FinanceLens;
  setCategory: string | null;
  provenance: 'owner_correction';
  sourceTransactionId: string | null;
}

/**
 * Convert an owner's correction into an explicit, editable rule built from
 * safe fields only (account, normalized merchant, direction, amount range,
 * recurrence). Never embeds raw descriptions or balances.
 */
export function deriveRuleFromCorrection(
  input: ClassificationInput,
  correction: OwnerCorrection
): DerivedRule {
  const merchant = normalizeMerchant(input.merchantName);
  return {
    name: merchant ? `Owner correction: ${merchant}` : 'Owner correction',
    matchAccountId: correction.scopeToAccount
      ? (input.accountId ?? null)
      : null,
    matchMerchantPattern: merchant || null,
    matchDirection: directionOf(input),
    matchAmountMin: correction.amountRange?.min ?? null,
    matchAmountMax: correction.amountRange?.max ?? null,
    matchRecurrence: correction.applyToRecurringOnly ? 'recurring' : null,
    setLens: correction.lens,
    setCategory: correction.category ?? null,
    provenance: 'owner_correction',
    sourceTransactionId: input.transactionId ?? null,
  };
}

export interface SplitLine {
  amount: number;
  lens: FinanceLens;
  category?: string | null;
  note?: string | null;
}

/**
 * Validate that split lines preserve the parent total exactly (to the cent).
 * Throws on mismatch so partial/incorrect splits never persist.
 */
export function validateSplitTotals(
  parentAmount: number,
  splits: SplitLine[]
): void {
  if (splits.length === 0) {
    throw new Error('Split requires at least one line');
  }
  for (const split of splits) {
    if (!FINANCE_LENSES.includes(split.lens)) {
      throw new Error(`Invalid split lens: ${split.lens}`);
    }
  }
  const sum = splits.reduce((acc, s) => acc + s.amount, 0);
  if (Math.abs(sum - parentAmount) > AMOUNT_TOLERANCE) {
    throw new Error(
      `Split total ${sum.toFixed(4)} does not equal transaction amount ${parentAmount.toFixed(4)}`
    );
  }
}

/**
 * Review-queue predicate: surface low-confidence, high-value, or ambiguous
 * transactions without blocking the rest of the dashboard.
 */
export function needsReview(
  input: ClassificationInput,
  result: ClassificationResult
): boolean {
  if (result.lens === 'uncategorized') return true;
  if (result.confidence < 0.6) return true;
  if (Math.abs(input.amount) >= 1000 && result.confidence < 0.8) return true;
  return false;
}
