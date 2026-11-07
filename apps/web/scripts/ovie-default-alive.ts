#!/usr/bin/env tsx
/**
 * Headless default-alive calculator for Summer and agents.
 *
 *   pnpm --filter @jovie/web exec tsx scripts/ovie-default-alive.ts \
 *     --attested <private.json> [--revenue <summer-revenue.json>] \
 *     [--mrr-usd N --mrr-source S --mrr-as-of ISO] [--at ISO] [--text]
 *
 * --attested: founder attestations (cash, fixed burn, growth) kept OUTSIDE
 *   this public repo (e.g. the private fundraising registry).
 * --plan: a use-of-funds plan JSON (e.g. the registry's financial plan). It is
 *   the source of truth for planned burn and overrides any plan in --attested.
 *   YAML is not read; write the plan as JSON.
 * --revenue: the JSON body of GET /api/internal/ovie/summer-company/revenue.
 * Variable burn is read from ops/registry/spend.json caps.
 * Prints the engine result as JSON (or the reasoning with --text).
 * Exit 2 when the verdict is unknown (a required input is a gap).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { evaluateDefaultAlive } from '../lib/ovie/default-alive/engine';
import {
  assembleDefaultAliveInputs,
  attestedFinanceSchema,
  mrrFromSummerRevenue,
  raisePlanSchema,
  variableBurnFromSpendRegistry,
} from '../lib/ovie/default-alive/inputs';

const { values } = parseArgs({
  options: {
    attested: { type: 'string' },
    plan: { type: 'string' },
    revenue: { type: 'string' },
    'mrr-usd': { type: 'string' },
    'mrr-source': { type: 'string' },
    'mrr-as-of': { type: 'string' },
    spend: { type: 'string' },
    at: { type: 'string' },
    text: { type: 'boolean', default: false },
  },
});

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, 'utf8'));
}

const spendPath =
  values.spend ??
  fileURLToPath(new URL('../../../ops/registry/spend.json', import.meta.url));
const attested = values.attested
  ? attestedFinanceSchema.parse(readJson(values.attested))
  : null;
if (values.plan && !values.plan.endsWith('.json')) {
  throw new Error('--plan must be a JSON file');
}
const plan = values.plan ? raisePlanSchema.parse(readJson(values.plan)) : null;

let mrr = null;
if (values.revenue) {
  mrr = mrrFromSummerRevenue(
    readJson(values.revenue) as Parameters<typeof mrrFromSummerRevenue>[0]
  );
} else if (values['mrr-usd'] !== undefined) {
  mrr = {
    value: Number(values['mrr-usd']),
    source: values['mrr-source'] ?? 'cli --mrr-usd',
    asOf: values['mrr-as-of'] ?? null,
    basis: 'measured' as const,
  };
}

const inputs = assembleDefaultAliveInputs({
  attested,
  plan,
  mrr,
  variableBurn: variableBurnFromSpendRegistry(
    readJson(spendPath) as Parameters<typeof variableBurnFromSpendRegistry>[0]
  ),
});
const result = evaluateDefaultAlive(
  inputs,
  values.at ?? new Date().toISOString()
);

process.stdout.write(
  values.text
    ? `${result.verdict} (confidence ${result.confidence})\n${result.reasoning.map(line => `- ${line}`).join('\n')}\n`
    : `${JSON.stringify(result, null, 2)}\n`
);
process.exitCode = result.verdict === 'unknown' ? 2 : 0;
