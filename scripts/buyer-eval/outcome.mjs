// Target outcome for a buyer eval: a paid conversion at the real public
// price, read at run time from the pricing source of truth. Never type a
// price into a prompt by hand (one price everywhere).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const PLAN_PRICES_PATH = 'apps/web/lib/config/plan-prices.ts';
export const OFFER_TRUTH_PATH = 'apps/web/lib/billing/offer-truth.ts';

/** Parse the paid self-serve offer out of plan-prices.ts / offer-truth.ts source text. */
export function parseOutcome(planPricesSrc, offerTruthSrc = '') {
  const pro =
    planPricesSrc.match(/\bpro:\s*\{([\s\S]*?)\n\s{2}\},/u)?.[1] ?? '';
  const displayName = pro.match(/displayName:\s*'([^']+)'/u)?.[1];
  const monthlyUsd = Number(pro.match(/monthlyUsd:\s*([\d.]+)/u)?.[1]);
  if (!displayName || !Number.isFinite(monthlyUsd) || monthlyUsd <= 0) {
    throw new Error('could not read the paid offer from plan-prices.ts');
  }
  const trialDays = Number(
    offerTruthSrc.match(/PRO_TRIAL_DURATION_DAYS\s*=\s*(\d+)/u)?.[1] ?? 0
  );
  return {
    kind: 'paid_conversion',
    plan: 'pro',
    displayName,
    monthlyUsd,
    trialDays: trialDays || null,
    horizonDays: 14,
  };
}

export function readOutcome(repoRoot) {
  const offer = (() => {
    try {
      return readFileSync(join(repoRoot, OFFER_TRUTH_PATH), 'utf8');
    } catch {
      return '';
    }
  })();
  return parseOutcome(
    readFileSync(join(repoRoot, PLAN_PRICES_PATH), 'utf8'),
    offer
  );
}

export function describeOutcome(outcome) {
  const trial = outcome.trialDays
    ? ` A ${outcome.trialDays}-day trial with no card exists; a trial start is NOT a payment.`
    : '';
  return `Outcome being predicted: this person starts a PAID "${outcome.displayName}" subscription at $${outcome.monthlyUsd}/month (card charged) within ${outcome.horizonDays} days of this session.${trial}`;
}
