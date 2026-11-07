#!/usr/bin/env node
// "Would you invest" eval (system-1 loop, like scripts/buyer-eval). Each
// simulated investor persona reads the generated deck text and forecasts
// invest / pass with p, objections and the most fixable objection. Calls go
// through the sanctioned Workers AI relay (routing.json caller
// dev.investor-eval) with the shared API client; never a subscription CLI.
//
//   node scripts/investor-deck/eval.mjs --deck <dir with deck.txt> [--samples 3] [--skip-calibration]
//
// api-budget: cloudflare-api 144/hr - one manual full default eval/hour: 6 x 3 candidate + 6 x (3 x 2 holdout + 3 anchor) = 72 calls, up to two transport attempts each; additional runs/samples scale this budget
// Writes <dir>/invest-eval.json (private). Exit 0 always; gate.mjs decides.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  callRelay,
  parseAnswer,
  ROUTING,
  routeFor,
  usdFor,
} from '../output-quality/judge-core.mjs';
import { readBuiltDeck } from './build.mjs';
import { ANCHOR, HOLDOUTS } from './calibration.mjs';
import { PERSONA_LABEL, PERSONAS } from './personas.mjs';
import {
  aggregateInvest,
  buildInvestPrompt,
  buildInvestSchema,
  parseInvestSample,
  RUBRIC_VERSION,
} from './rubric.mjs';

export const ROUTE_ID = 'dev.investor-eval';
export function investRoute(routing = ROUTING) {
  const { model, baseUrl } = routeFor(ROUTE_ID, routing);
  return { model, baseUrl };
}

/**
 * Words only company memory holds. Narrower than buyer-eval's list: investors
 * say "ICP" and "summer" in normal speech (2026-11-01: "icp" voided 5 valid samples).
 */
export const INVEST_CONTAMINATION = Object.freeze([
  'ovie',
  'gbrain',
  '$300/mo',
  'premium pricing',
]);

export function investContaminated(raw, prompt) {
  const out = JSON.stringify(raw ?? '').toLowerCase();
  const inPrompt = prompt.toLowerCase();
  return INVEST_CONTAMINATION.filter(
    word => out.includes(word) && !inPrompt.includes(word)
  );
}

/** The relay caps output at 16,384; reasoning answers truncated at 12,000. */
export const INVEST_MAX_TOKENS = 16_000;

// Preserve the investor job's eight-call ceiling: 84 concurrent calls opened
// the breaker on a secondary limit (2026-11-01). This is job orchestration;
// the unchanged shared client still owns budgets, pacing, retries and breakers.
export const MAX_IN_FLIGHT = 8;
let inFlight = 0;
/** @type {Array<() => void>} */
const waiting = [];
export async function pooled(fn) {
  if (inFlight < MAX_IN_FLIGHT) inFlight += 1;
  else await new Promise(resolve => waiting.push(() => resolve(undefined)));
  try {
    return await fn();
  } finally {
    const next = waiting.shift();
    // Transfer the occupied slot before waking its waiter. A new arrival must
    // never steal the slot between release and the waiter's continuation.
    if (next) next();
    else inFlight -= 1;
  }
}

/** N independent samples for one persona over one deck. */
export async function judgeDeck({
  persona,
  deck,
  samples = 3,
  call = callRelay,
  route = investRoute(),
}) {
  if (!Number.isSafeInteger(samples) || samples < 1)
    throw new Error('samples must be a positive integer');
  const prompt = buildInvestPrompt({ persona, deck });
  const schema = buildInvestSchema();
  const settled = await Promise.allSettled(
    Array.from({ length: samples }, () =>
      pooled(() =>
        call({
          model: route.model,
          baseUrl: route.baseUrl,
          content: [{ type: 'text', text: prompt }],
          schema,
          timeoutMs: 300_000,
          maxTokens: INVEST_MAX_TOKENS,
        })
      )
    )
  );
  const parsed = [];
  const failures = [];
  let costUsd = 0;
  for (const result of settled) {
    if (result.status === 'rejected') {
      failures.push(
        String(result.reason?.message ?? result.reason).slice(0, 200)
      );
      continue;
    }
    costUsd += usdFor(result.value.usage);
    try {
      const answer = parseAnswer(result.value.text);
      const leaks = investContaminated(answer, prompt);
      if (leaks.length) throw new Error(`contaminated: ${leaks.join(',')}`);
      parsed.push(parseInvestSample(answer));
    } catch (error) {
      failures.push(String(error?.message ?? error).slice(0, 200));
    }
  }
  return {
    ...aggregateInvest(parsed),
    samples: parsed.length,
    failures,
    costUsd,
  };
}

/**
 * Calibration (policy, not probability). Under low base rates a judge gives
 * even a deck YC funded p < 0.5 (2026-11-01: anchor 0.09 to 0.43), so the bar
 * is relative: per persona, every known-bad holdout must score below the
 * funded anchor (separation). At most one persona may fail separation; that
 * persona's vote is not counted.
 */
export function calibrationHolds(rows) {
  /** @type {Map<string, string>} */
  const expected = new Map([[ANCHOR.id, 'anchor']]);
  for (const holdout of HOLDOUTS) expected.set(holdout.id, 'holdout');
  const validRows = Array.isArray(rows) ? rows : [];
  const unknown = validRows.some(
    row =>
      !row ||
      !PERSONAS.some(p => p.id === row.persona) ||
      !expected.has(row.deck) ||
      expected.get(row.deck) !== row.kind
  );
  const personas = PERSONAS.map(({ id: persona }) => {
    const selected = validRows.filter(row => row?.persona === persona);
    const complete =
      selected.length === expected.size &&
      new Set(selected.map(row => row.deck)).size === expected.size &&
      selected.every(
        row =>
          expected.has(row.deck) &&
          expected.get(row.deck) === row.kind &&
          ['invest', 'pass'].includes(row.verdict) &&
          Number.isFinite(row.p) &&
          row.p >= 0 &&
          row.p <= 1
      );
    const anchor = selected.find(row => row.deck === ANCHOR.id);
    const holdouts = selected.filter(
      row => expected.get(row.deck) === 'holdout'
    );
    const anchorP = complete ? anchor.p : null;
    const maxHoldoutP = complete
      ? Math.max(...holdouts.map(row => row.p))
      : null;
    return {
      persona,
      anchorP,
      maxHoldoutP,
      separated: complete && maxHoldoutP < anchorP,
    };
  });
  const unseparated = personas.filter(p => !p.separated).map(p => p.persona);
  const complete =
    validRows.length === PERSONAS.length * expected.size &&
    new Set(validRows.map(row => `${row?.persona}:${row?.deck}`)).size ===
      validRows.length;
  return {
    ok: complete && !unknown && unseparated.length <= 1,
    unseparated,
    personas,
  };
}

/** A persona says invest when its p for this deck reaches its p for the funded anchor. */
export function relativeVerdicts(personas, calibration) {
  return personas.map(p => {
    const cal = calibration?.personas.find(c => c.persona === p.persona);
    if (!cal?.separated || p.p === null)
      return { ...p, relative: 'unscored', anchorP: cal?.anchorP ?? null };
    return {
      ...p,
      relative: p.p >= cal.anchorP ? 'invest' : 'pass',
      anchorP: cal.anchorP,
    };
  });
}

async function main() {
  const { values } = parseArgs({
    options: {
      deck: { type: 'string' },
      samples: { type: 'string', default: '3' },
      'skip-calibration': { type: 'boolean', default: false },
      'reuse-calibration': { type: 'string' },
    },
  });
  if (!values.deck) throw new Error('--deck <build output dir> is required');
  const { build, deck } = readBuiltDeck(values.deck);
  const samples = Number(values.samples);
  const started = Date.now();
  const personas = await Promise.all(
    PERSONAS.map(async persona => ({
      persona: persona.id,
      modelledOn: persona.modelledOn,
      ...(await judgeDeck({ persona, deck, samples })),
    }))
  );
  let calibration = [];
  const reuse = values['reuse-calibration']
    ? JSON.parse(readFileSync(values['reuse-calibration'], 'utf8'))
    : null;
  if (
    reuse &&
    reuse.rubric === RUBRIC_VERSION &&
    reuse.model === investRoute().model &&
    reuse.calibrationRows?.length
  )
    calibration = reuse.calibrationRows;
  else if (!values['skip-calibration']) {
    const decks = [
      ...HOLDOUTS.map(h => ({ ...h, kind: 'holdout', samples: 2 })),
      { ...ANCHOR, kind: 'anchor', samples: 3 },
    ];
    calibration = await Promise.all(
      decks.flatMap(fixture =>
        PERSONAS.map(async persona => ({
          deck: fixture.id,
          kind: fixture.kind,
          persona: persona.id,
          ...(await judgeDeck({
            persona,
            deck: fixture.deck,
            samples: fixture.samples,
          })),
        }))
      )
    );
  }
  const cal = calibration.length ? calibrationHolds(calibration) : null;
  const scored = relativeVerdicts(personas, cal);
  const report = {
    schema: 'jovie.investor-deck.invest-eval/v1',
    label: PERSONA_LABEL,
    rubric: RUBRIC_VERSION,
    route: ROUTE_ID,
    model: investRoute().model,
    deckSha256: build.deckSha256,
    deckTextSha256: createHash('sha256').update(deck).digest('hex'),
    personas: scored,
    yes: scored.filter(p => p.relative === 'invest').length,
    absoluteYes: personas.filter(p => p.verdict === 'invest').length,
    calibration: cal,
    calibrationReused: Boolean(reuse && calibration === reuse.calibrationRows),
    calibrationRows: calibration.map(({ deck, kind, persona, verdict, p }) => ({
      deck,
      kind,
      persona,
      verdict,
      p,
    })),
    costUsd: [...personas, ...calibration].reduce(
      (sum, r) => sum + (r.costUsd ?? 0),
      0
    ),
    ms: Date.now() - started,
    at: new Date().toISOString(),
  };
  writeFileSync(
    join(values.deck, 'invest-eval.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    { mode: 0o600 }
  );
  for (const p of scored)
    process.stdout.write(
      `${p.persona.padEnd(28)} ${p.relative.padEnd(8)} p=${p.p?.toFixed(2) ?? '-'} anchor=${p.anchorP?.toFixed(2) ?? '-'} n=${p.samples}  fix: ${String(p.mostFixable?.objection ?? '-').slice(0, 140)}\n`
    );
  process.stdout.write(
    `yes ${report.yes}/${personas.length} (absolute ${report.absoluteYes})  calibration ${report.calibration ? `ok=${report.calibration.ok} unseparated=${report.calibration.unseparated.join(',') || 'none'}` : 'skipped'}  $${report.costUsd.toFixed(3)}  ${Math.round(report.ms / 1000)}s\n`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
