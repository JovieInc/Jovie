import 'server-only';

/**
 * Financial metric definitions + assumptions
 *
 * Purpose: document the intent behind finance KPIs so future audits can trace
 * the logic back to a single source of truth when we wire Mercury + Stripe
 * into computation.
 *
 * Balance (Mercury checking balance)
 * - Definition: account-level balance from Mercury Checking account(s) only.
 * - Source of truth: Mercury account balance endpoint (per account).
 * - Assumption: excludes savings/treasury unless explicitly added to scope.
 *
 * Burn Rate (30-day)
 * - Definition: total Mercury debits over the trailing 30 days, normalized to
 *   a 30-day month (no annualization beyond 30 days).
 * - Default exclusions:
 *   - Internal transfers between Mercury accounts (own account ↔ own account).
 *   - Refunds, chargebacks, reversals (non-operating offsets).
 *   - Failed/voided transactions.
 * - Optional exclusions (only if explicitly configured): non-operating
 *   expenses such as financing flows or one-off asset purchases.
 *
 * Runway (months)
 * - Formula: (cash_balance + forecasted_30_day_revenue) / net_burn_monthly
 * - net_burn_monthly = max(0, expenses_30d - revenue_30d)
 * - revenue_30d default: Stripe MRR proxy (see getAdminStripeOverviewMetrics in
 *   lib/admin/stripe-metrics.ts) scaled to 30 days.
 * - If cash-in is preferred instead of Stripe MRR, swap revenue_30d for
 *   Mercury credits filtered to operating revenue sources.
 *
 * Default Alive / Default Dead (Paul Graham)
 * - Decision: "Default Alive" when net_burn_monthly <= 0 (i.e., revenue_30d >=
 *   expenses_30d). Otherwise "Default Dead."
 * - Rationale: aligns with YC guidance that survival is driven by net burn,
 *   not revenue growth alone.
 */

export {};
