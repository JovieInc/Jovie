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
import {
  callRelay,
  contaminated,
  parseAnswer,
  usdFor,
} from '../buyer-eval/judge.mjs';
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
      call({
        model: route.model,
        baseUrl: route.baseUrl,
        content: [{ type: 'text', text: prompt }],
        schema,
        timeoutMs: 240_000,
      })
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
      const leaks = contaminated(answer, prompt);
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

/** Calibration: holdouts must pass for all personas, anchor must be invest for a majority. */
export function calibrationHolds(rows) {
  const holdoutYes = rows.filter(
    r => r.kind === 'holdout' && r.verdict === 'invest'
  );
  const anchor = rows.filter(r => r.kind === 'anchor');
  const anchorYes = anchor.filter(r => r.verdict === 'invest').length;
  return {
    ok: holdoutYes.length === 0 && anchorYes * 2 > anchor.length,
    holdoutYes: holdoutYes.map(r => `${r.deck}/${r.persona}`),
    anchorYes,
    anchorTotal: anchor.length,
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      deck: { type: 'string' },
      samples: { type: 'string', default: '3' },
      'skip-calibration': { type: 'boolean', default: false },
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
  const calibration = [];
  if (!values['skip-calibration']) {
    const decks = [
      ...HOLDOUTS.map(h => ({ ...h, kind: 'holdout' })),
      { ...ANCHOR, kind: 'anchor' },
    ];
    const rows = await Promise.all(
      decks.flatMap(fixture =>
        PERSONAS.map(async persona => ({
          deck: fixture.id,
          kind: fixture.kind,
          persona: persona.id,
          ...(await judgeDeck({ persona, deck: fixture.deck, samples: 2 })),
        }))
      )
    );
    calibration.push(...rows);
  }
  const report = {
    schema: 'jovie.investor-deck.invest-eval/v1',
    label: PERSONA_LABEL,
    rubric: RUBRIC_VERSION,
    route: ROUTE_ID,
    model: investRoute().model,
    deckSha256: build.deckSha256,
    deckTextSha256: createHash('sha256').update(deck).digest('hex'),
    personas,
    yes: personas.filter(p => p.verdict === 'invest').length,
    calibration: values['skip-calibration']
      ? null
      : calibrationHolds(calibration),
    calibrationRows: calibration.map(({ deck, kind, persona, verdict, p }) => ({
      deck,
      kind,
      persona,
      verdict,
      p,
    })),
    costUsd: [...personas, ...calibration].reduce(
      (sum, r) => sum + r.costUsd,
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
  for (const p of personas)
    process.stdout.write(
      `${p.persona.padEnd(28)} ${p.verdict.padEnd(7)} p=${p.p?.toFixed(2) ?? '-'} n=${p.samples}  fix: ${p.mostFixable?.objection ?? '-'}\n`
    );
  process.stdout.write(
    `yes ${report.yes}/${personas.length}  calibration ${report.calibration ? JSON.stringify(report.calibration) : 'skipped'}  $${report.costUsd.toFixed(3)}  ${Math.round(report.ms / 1000)}s\n`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
