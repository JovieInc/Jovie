/**
 * Extracts the live price table (cents, keyed by LivePriceKey) from the source
 * text of the files that define what customers pay. The CI guard runs the same
 * extractor on the base ref and on HEAD, so it needs no module resolution.
 * live-prices.test.ts pins the extractor against the real exports, so a
 * refactor that hides a price from the extractor turns that test red instead of
 * silently weakening the guard.
 */

import type { LivePriceTable } from './types';

/** Files whose amounts define live prices. Adding a price file means adding it here. */
export const LIVE_PRICE_SOURCE_FILES = {
  planPrices: 'apps/web/lib/config/plan-prices.ts',
  legacyPrices: 'apps/web/lib/stripe/legacy-prices.ts',
  stripeConfig: 'apps/web/lib/stripe/config.ts',
} as const;

export type LivePriceSources = {
  readonly [K in keyof typeof LIVE_PRICE_SOURCE_FILES]: string;
};

const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function matchOrThrow(
  source: string,
  re: RegExp,
  what: string
): RegExpMatchArray {
  const match = re.exec(source);
  if (!match) {
    throw new Error(
      `price extractor could not find ${what}; update live-prices.ts together with the price file`
    );
  }
  return match;
}

export function extractLivePrices(sources: LivePriceSources): LivePriceTable {
  const table: Record<string, number> = {};

  const plan = stripComments(sources.planPrices);
  const proMonthlyUsd = Number(
    matchOrThrow(plan, /monthlyUsd:\s*(\d+(?:\.\d+)?)/, 'pro.monthlyUsd')[1]
  );
  table['offer:pro:month'] = Math.round(proMonthlyUsd * 100);
  const proYearly = matchOrThrow(
    plan,
    /PLAN_PRICES\s*=\s*\{[\s\S]*?pro:\s*\{[^}]*?yearly:\s*(\d+(?:\.\d+)?)/,
    'PLAN_PRICES.pro.yearly'
  );
  table['offer:pro:year'] = Math.round(Number(proYearly[1]) * 100);
  const max = matchOrThrow(
    plan,
    /max:\s*\{\s*monthly:\s*(\d+(?:\.\d+)?),\s*yearly:\s*(\d+(?:\.\d+)?)/,
    'PLAN_PRICES.max'
  );
  table['offer:max:month'] = Math.round(Number(max[1]) * 100);
  table['offer:max:year'] = Math.round(Number(max[2]) * 100);

  const legacy = stripComments(sources.legacyPrices);
  const legacyRe =
    /priceId:\s*LEGACY_STRIPE_PRICE_IDS\.(\w+),\s*plan:\s*'\w+',\s*amount:\s*(\d+)/g;
  let legacyMatch: RegExpExecArray | null = legacyRe.exec(legacy);
  while (legacyMatch) {
    table[`legacy:${legacyMatch[1]}`] = Number(legacyMatch[2]);
    legacyMatch = legacyRe.exec(legacy);
  }
  if (!Object.keys(table).some(key => key.startsWith('legacy:'))) {
    throw new Error('price extractor found no legacy prices');
  }

  const config = stripComments(sources.stripeConfig);
  const configRe =
    /priceId:\s*([^,\n]+),\s*plan:\s*[^,]+,\s*amount:\s*(\d+)\s*,/g;
  let configMatch: RegExpExecArray | null = configRe.exec(config);
  while (configMatch) {
    const expression = (configMatch[1] ?? '').split('||')[0]?.trim() ?? '';
    const name = expression.split('.').pop()?.trim();
    if (name) table[`config:${name}`] = Number(configMatch[2]);
    configMatch = configRe.exec(config);
  }
  return table;
}
