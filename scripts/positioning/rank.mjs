#!/usr/bin/env node
// Offline positioning ranker (canon/positioning-variants.json).
//
//   node scripts/positioning/rank.mjs [--registry canon/positioning-variants.json]
//        [--panel <investor-personas.json>] [--samples 2] [--out <receipt.json>]
//        [--gates-only]
//
// 1. Gates every variant (gates.mjs). Failures and pivot signals never reach a persona.
// 2. Shows each persona ALL passing variants at once, shuffled and lettered, and
//    asks for a 0-10 score per variant plus a yes/no on the persona's own question.
//    Investors: --panel file (private; built from official guidance only, never
//    committed here). Buyers: the public buyer-eval archetypes (rubric.mjs).
// 3. Aggregates per variant and declares a winner only when one variant leads on
//    BOTH panels by at least WIN_MARGIN; otherwise "no clear winner" (keep active).
//
// Model: routing.json caller `dev.evals` (Workers AI relay, WORKERS_AI_TOKEN).
// api-budget: cloudflare-api 60/hr - manual or event-triggered runs only, (personas x samples) calls per run
// Receipts are evidence, not the personas' opinions; never quote them as such.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { callRelay } from '../buyer-eval/judge.mjs';
import { ARCHETYPES } from '../buyer-eval/rubric.mjs';
import { gateVariant } from './gates.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const ROUTE_ID = 'dev.evals';
export const RECEIPT_SCHEMA = 'jovie.positioning-rank-receipt/v1';
/** A winner must lead the runner-up by this much on each panel (0-10 scale). */
export const WIN_MARGIN = 0.5;

export function evalRoute(
  routingPath = resolve(REPO, 'apps/web/lib/ai/routing.json')
) {
  const routing = JSON.parse(readFileSync(routingPath, 'utf8'));
  const caller = routing.callers.find(row => row.id === ROUTE_ID);
  if (caller?.route !== 'workers-ai-only' || !caller.models?.[0])
    throw new Error(
      `${ROUTE_ID} must be a workers-ai-only caller with a model`
    );
  return {
    model: caller.models[0],
    baseUrl: routing.providers['workers-ai'].relayBaseUrl,
  };
}

/** Deterministic shuffle so a run is reproducible per (persona, sample). */
export function shuffled(items, seed) {
  const out = [...items];
  let state = seed >>> 0 || 1;
  for (let i = out.length - 1; i > 0; i--) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const j = state % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const LETTERS = 'ABCDEFGHIJKLMNOP';

export function buildPrompt({ persona, kind, variants }) {
  const blocks = variants
    .map((v, i) =>
      kind === 'investor'
        ? `[${LETTERS[i]}]\nOne-liner: ${v.lines.one_liner}\nWhat are you building: ${v.lines.what_building}\nDeck title slide: ${v.lines.deck_title}`
        : `[${LETTERS[i]}]\nHeadline: ${v.lines.one_liner}\nExplanation: ${v.lines.what_building}`
    )
    .join('\n\n');
  const lens =
    kind === 'investor'
      ? `You are reviewing startup applications using ONLY this reviewer lens (built from their public guidance):
Role: ${persona.role}
Looks for: ${persona.looks_for.join(' | ')}
Red flags: ${(persona.red_flags ?? []).join(' | ') || 'none listed'}
Key question: ${persona.the_question}

Every option below describes the SAME company and the SAME product; only the framing differs. A solo founder, pre-revenue, with a live product. Judge which framing makes you want to keep reading and take a meeting, and which triggers your red flags (jargon, buzzwords, unclear what exists today, overblown claims).`
      : `You are this person: ${persona.brief}

You land on a web page. Every option below is the same product described differently. For each, judge how well you understand what it is and whether you would click to try it.`;
  return `${lens}

${blocks}

Score every option 0-10 (10 = strongest). Return JSON only: {"scores":[{"option":"A","score":0,"yes":false,"red_flags":["..."],"reason":"one sentence"}]} with one entry per option.`;
}

export function schemaFor(count) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['scores'],
    properties: {
      scores: {
        type: 'array',
        minItems: count,
        maxItems: count,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['option', 'score', 'yes', 'red_flags', 'reason'],
          properties: {
            option: { type: 'string', enum: [...LETTERS.slice(0, count)] },
            score: { type: 'number', minimum: 0, maximum: 10 },
            yes: { type: 'boolean' },
            red_flags: { type: 'array', items: { type: 'string' } },
            reason: { type: 'string' },
          },
        },
      },
    },
  };
}

/** Map a lettered answer back to variant ids; reject incomplete answers. */
export function parseScores(text, order) {
  const raw = String(text ?? '').trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/u.exec(raw);
  const answer = JSON.parse(fenced ? fenced[1] : raw);
  const byLetter = new Map(answer.scores.map(s => [s.option, s]));
  return order.map((variant, i) => {
    const s = byLetter.get(LETTERS[i]);
    if (!s || typeof s.score !== 'number')
      throw new Error(`missing option ${LETTERS[i]}`);
    return {
      id: variant.id,
      score: Math.max(0, Math.min(10, s.score)),
      yes: Boolean(s.yes),
      redFlags: s.red_flags ?? [],
      reason: String(s.reason ?? '').slice(0, 300),
    };
  });
}

function mean(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/** Aggregate per variant per panel, rank, and apply the clear-winner rule. */
export function aggregate(results, variantIds) {
  const rows = variantIds.map(id => {
    const row = { id };
    for (const kind of ['investor', 'buyer']) {
      const mine = results
        .filter(r => r.kind === kind)
        .flatMap(r => r.scores.filter(s => s.id === id));
      row[kind] = {
        mean: mean(mine.map(s => s.score)),
        yesRate: mean(mine.map(s => (s.yes ? 1 : 0))),
        n: mine.length,
      };
    }
    row.combined =
      row.investor.mean != null && row.buyer.mean != null
        ? Math.min(row.investor.mean, row.buyer.mean)
        : null;
    return row;
  });
  rows.sort((a, b) => (b.combined ?? -1) - (a.combined ?? -1));
  const lead = kind =>
    [...rows].sort((a, b) => (b[kind].mean ?? -1) - (a[kind].mean ?? -1));
  const inv = lead('investor');
  const buy = lead('buyer');
  const clear =
    inv[0]?.id === buy[0]?.id &&
    inv.length > 1 &&
    inv[0].investor.mean - inv[1].investor.mean >= WIN_MARGIN &&
    buy[0].buyer.mean - buy[1].buyer.mean >= WIN_MARGIN;
  return {
    ranking: rows,
    investorLeader: inv[0]?.id ?? null,
    buyerLeader: buy[0]?.id ?? null,
    winner: clear ? inv[0].id : null,
    rule: `winner = same variant leads both panels by >= ${WIN_MARGIN}`,
  };
}

function parseArgs(argv) {
  const args = {
    registry: resolve(REPO, 'canon/positioning-variants.json'),
    samples: 2,
    gatesOnly: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--registry') args.registry = argv[++i];
    else if (a === '--panel') args.panel = argv[++i];
    else if (a === '--samples') args.samples = Number(argv[++i]);
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--gates-only') args.gatesOnly = true;
    else throw new Error(`unknown argument ${a}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const registry = JSON.parse(readFileSync(args.registry, 'utf8'));
  const gates = registry.variants.map(v => gateVariant(v, registry));
  for (const g of gates)
    console.log(
      `${g.pass ? 'PASS' : 'FAIL'} ${g.id}${g.pivotSignal ? ' [PIVOT SIGNAL]' : ''}${g.failures.length ? `\n  - ${g.failures.join('\n  - ')}` : ''}`
    );
  if (args.gatesOnly) {
    process.exitCode = gates.some(g => !g.pass) ? 1 : 0;
    return;
  }
  if (!args.panel)
    throw new Error(
      '--panel <investor-personas.json> required (private store)'
    );
  const passing = registry.variants.filter((v, i) => gates[i].pass);
  const investors = JSON.parse(readFileSync(args.panel, 'utf8')).personas;
  const buyers = ARCHETYPES.map(a => ({ ...a, kind: 'buyer' }));
  const panel = [
    ...investors.map(p => ({ ...p, kind: 'investor' })),
    ...buyers,
  ];
  const { model, baseUrl } = evalRoute();
  const jobs = panel.flatMap((persona, p) =>
    Array.from({ length: args.samples }, (_, s) => ({
      persona,
      order: shuffled(passing, p * 101 + s * 7 + 1),
    }))
  );
  const settled = await Promise.allSettled(
    jobs.map(async ({ persona, order }) => {
      const content = buildPrompt({
        persona,
        kind: persona.kind,
        variants: order,
      });
      const { text } = await callRelay({
        model,
        baseUrl,
        content,
        schema: schemaFor(order.length),
        timeoutMs: 300_000,
      });
      return {
        persona: persona.id,
        kind: persona.kind,
        control: Boolean(persona.control),
        scores: parseScores(text, order),
      };
    })
  );
  const results = settled
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value);
  const failures = settled
    .filter(r => r.status === 'rejected')
    .map(r => String(r.reason?.message ?? r.reason).slice(0, 200));
  // Off-ICP control buyers are a sanity check, not a vote.
  const voting = results.filter(r => !r.control);
  const summary = aggregate(
    voting,
    passing.map(v => v.id)
  );
  const receipt = {
    schema: RECEIPT_SCHEMA,
    at: new Date().toISOString(),
    model,
    route: ROUTE_ID,
    samples: args.samples,
    gates,
    summary,
    results,
    failures,
  };
  if (args.out)
    writeFileSync(args.out, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(
    `\nresponses ${results.length}/${jobs.length}, failures ${failures.length}`
  );
  for (const r of summary.ranking)
    console.log(
      `${r.id.padEnd(28)} inv ${r.investor.mean?.toFixed(2)} (yes ${(r.investor.yesRate * 100).toFixed(0)}%)  buy ${r.buyer.mean?.toFixed(2)} (yes ${(r.buyer.yesRate * 100).toFixed(0)}%)`
    );
  console.log(
    `winner: ${summary.winner ?? 'none (no clear winner; keep active)'}`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
