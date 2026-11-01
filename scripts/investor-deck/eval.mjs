#!/usr/bin/env node
// "Would you invest" eval (system-1 loop, like scripts/buyer-eval). Each
// simulated investor persona reads the generated deck text and forecasts
// invest / pass with p, objections and the most fixable objection. Calls go
// through the sanctioned Workers AI relay (routing.json caller
// dev.investor-eval) with the shared API client; never a subscription CLI.
//
//   node scripts/investor-deck/eval.mjs --deck <dir with deck.txt> [--samples 3] [--skip-calibration]
//
// api-budget: cloudflare-api 40/hr - one eval = (6 personas + 4 calibration decks) x 3 samples, run by hand per deck change
// Writes <dir>/invest-eval.json (private). Exit 0 always; gate.mjs decides.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { callRelay, parseAnswer, usdFor } from '../buyer-eval/judge.mjs';
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
const ROUTING = JSON.parse(
  readFileSync(
    new URL('../../apps/web/lib/ai/routing.json', import.meta.url),
    'utf8'
  )
);

export function investRoute(routing = ROUTING) {
  const caller = routing.callers.find(row => row.id === ROUTE_ID);
  if (!caller?.models?.[0])
    throw new Error(`routing.json has no ${ROUTE_ID} caller`);
  if (caller.route !== 'workers-ai-only')
    throw new Error(`${ROUTE_ID} must be workers-ai-only, got ${caller.route}`);
  return {
    model: caller.models[0],
    baseUrl: routing.providers['workers-ai'].relayBaseUrl,
  };
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

/** Max relay calls in flight: 84 at once opened the breaker on a secondary limit (2026-11-01). */
export const MAX_IN_FLIGHT = 8;
let inFlight = 0;
const waiting = [];
/** Bound concurrent relay calls across every persona and fixture in this process. */
export async function pooled(fn) {
  if (inFlight >= MAX_IN_FLIGHT)
    await new Promise(resolve => waiting.push(resolve));
  inFlight += 1;
  try {
    return await fn();
  } finally {
    inFlight -= 1;
    waiting.shift()?.();
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
  const perPersona = {};
  for (const row of rows) {
    const entry = (perPersona[row.persona] ??= {
      anchorP: null,
      holdoutPs: [],
    });
    if (row.kind === 'anchor')
      entry.anchorP = row.verdict === 'abstain' ? null : row.p;
    else if (row.verdict !== 'abstain') entry.holdoutPs.push(row.p);
  }
  const personas = Object.entries(perPersona).map(([persona, e]) => ({
    persona,
    anchorP: e.anchorP,
    maxHoldoutP: e.holdoutPs.length ? Math.max(...e.holdoutPs) : null,
    separated:
      e.anchorP !== null &&
      e.holdoutPs.length >= 2 &&
      Math.max(...e.holdoutPs) < e.anchorP,
  }));
  const unseparated = personas.filter(p => !p.separated).map(p => p.persona);
  return {
    ok: personas.length > 0 && unseparated.length <= 1,
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
  const deck = readFileSync(join(values.deck, 'deck.txt'), 'utf8');
  const build = JSON.parse(
    readFileSync(join(values.deck, 'build.json'), 'utf8')
  );
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
