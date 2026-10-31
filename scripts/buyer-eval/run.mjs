#!/usr/bin/env node
// Buyer-eval CLI (decisions/company/buyer-eval-gate-2026-10-31).
//
//   node scripts/buyer-eval/run.mjs --walk <run-dir|video> --persona <archetype-id|persona.json>
//        [--sha <prod sha>] [--subject <id>] [--samples 3] [--strong always|auto|never]
//        [--walk-subject <id>] [--holdout [--expect pay]] [--signals-dir <dir>] [--expect-categories a,b]
//
// Writes a receipt to $BUYER_EVAL_STATE/receipts/ (default
// ~/.local/state/jovie-buyer-eval, private, never the repo), appends the
// per-run cost to cost.jsonl, and, for fileable objections on a non-holdout
// run, writes jovie-factory-signal/v1 files for factory_intake.
// Tier B persona files hold public facts plus identityTokens used only for
// redaction; tokens never leave this process.

import { createHash } from 'node:crypto';
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ingestWalk } from './ingest.mjs';
import { judgeBuyer } from './judge.mjs';
import { readOutcome } from './outcome.mjs';
import {
  ARCHETYPES,
  aggregateSamples,
  assertNoIdentity,
  fileableObjections,
  holdoutHolds,
  objectionRecall,
  publicPersonaBrief,
  RECEIPT_SCHEMA,
  RUBRIC_VERSION,
  redact,
} from './rubric.mjs';
import { runScreen } from './screen.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const STATE =
  process.env.BUYER_EVAL_STATE ??
  join(homedir(), '.local/state/jovie-buyer-eval');

export function parseArgs(argv) {
  const args = { samples: 3, strong: 'auto', holdout: false };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/u, '');
    if (key === 'holdout') args.holdout = true;
    else args[key.replace(/-(\w)/gu, (_, c) => c.toUpperCase())] = argv[++i];
  }
  args.samples = Number(args.samples) || 3;
  return args;
}

/**
 * @typedef {{ id: string, tier: 'A' | 'B', brief: string, identityTokens: string[], control?: boolean }} Persona
 * @param {string} ref archetype id or path to a Tier B persona file
 * @returns {Persona}
 */
export function loadPersona(ref) {
  const archetype = ARCHETYPES.find(row => row.id === ref);
  if (archetype) return { ...archetype, tier: 'A', identityTokens: [] };
  const file = JSON.parse(readFileSync(ref, 'utf8'));
  return {
    id: file.subjectId,
    tier: 'B',
    brief: publicPersonaBrief(file.facts),
    identityTokens: file.identityTokens ?? [],
  };
}

const canonical = value => JSON.stringify(value, Object.keys(value).sort());

export function factorySignal(receipt, objection) {
  const fp = `buyer-eval-${objection.category}-${createHash('sha256')
    // Root cause, not persona: the same objection from three personas is one fix.
    .update(`${objection.stepTitle}|${objection.category}`)
    .digest('hex')
    .slice(0, 10)}`;
  return {
    schema: 'jovie-factory-signal/v1',
    fingerprint: fp,
    source: 'buyer-eval',
    title:
      `Buyer eval: ${objection.category.replaceAll('_', ' ')} at golden-path step "${objection.stepTitle}"`.slice(
        0,
        140
      ),
    problem: `A strong-tier buyer forecast (${RUBRIC_VERSION}, ${objection.votes}/${receipt.strong.coherentSamples} samples) predicts no payment at $${receipt.outcome.monthlyUsd}/mo. Objection at ${objection.tSec}s ("${objection.stepTitle}"): ${objection.text}`,
    acceptance: [
      "Ship a user-visible product change (capability, proof on the user's own data, offer or flow), not copy that only asserts value; the change passes golden-path certification.",
      'Generalization sweep: check whether the same objection applies on the other golden-path steps, apps and agent surfaces; fix once at the highest layer.',
      "Leave a durable guard (test, invariant or DOM check) that fails if this objection's cause returns.",
      'Re-run buyer eval for every ICP archetype on the new prod SHA; this objection no longer appears in >= 2 of 3 samples for any of them.',
    ],
    metric: {
      name: 'buyer-eval median p(pay) on the golden-path walk (ICP archetypes)',
      baseline: receipt.strong.pPay,
      target: 0.65,
      measuredBy: 'node scripts/buyer-eval/run.mjs',
    },
    labels: ['compounding'],
    evidence: {
      receipt: receipt.id,
      persona: receipt.persona.id,
      sha: receipt.sha,
      stepId: objection.stepId,
      tSec: objection.tSec,
    },
  };
}

export async function evaluate(args) {
  const startedAt = Date.now();
  const persona = loadPersona(args.persona);
  const outcome = readOutcome(REPO);
  /** @type {ReturnType<typeof ingestWalk> & { subjectId?: string | null }} */
  const walk = ingestWalk(resolve(args.walk));
  // Whose walk this is: the waitlist subject the walk was recorded for, or
  // null for the shared stand-in walk (judge is told the artist is a stand-in).
  walk.subjectId = args.walkSubject ?? null;
  if (walk.steps.length === 0) throw new Error('walk has no judgeable steps');
  const titles = new Map(walk.steps.map(step => [step.stepId, step.title]));
  const scrub = text => redact(text, persona.identityTokens);

  /** @type {Record<string, any>} */
  const screen = await runScreen(walk.steps);
  let strong = null;
  let verdict;
  const screenNo = screen.status === 'evaluated' && screen.blockers.length > 0;
  const wantStrong =
    args.strong === 'always' || (args.strong === 'auto' && !screenNo);
  if (wantStrong) {
    const judged = await judgeBuyer({
      persona,
      outcome,
      walk,
      samples: args.samples,
    });
    strong = {
      model: judged.model,
      failures: judged.failures,
      costUsd: judged.costUsd,
      ...aggregateSamples(judged.samples),
      sampleP: judged.samples.map(sample => ({
        p: sample.pPay,
        raw: sample.rawPPay,
        p3x: sample.pPay3x,
        coherent: sample.coherent,
        capped: sample.capped,
      })),
    };
    verdict = strong.verdict;
  } else if (screenNo) {
    verdict = 'no_pay';
  } else {
    verdict = 'abstain';
  }
  const objections = (strong?.objections ?? screen.blockers ?? []).map(row => ({
    text: scrub(row.text ?? `screen: ${row.check} (p=${row.p?.toFixed?.(2)})`),
    stepId: row.stepId,
    stepTitle: scrub(titles.get(row.stepId) ?? ''),
    tSec: row.tSec,
    category: row.category,
    severity: row.severity ?? 'blocker',
    votes: row.votes ?? null,
  }));
  const receipt = {
    schema: RECEIPT_SCHEMA,
    rubric: RUBRIC_VERSION,
    at: new Date().toISOString(),
    sha: args.sha ?? null,
    subject: args.subject ?? persona.id,
    persona: {
      id: persona.id,
      tier: persona.tier,
      control: Boolean(persona.control),
    },
    holdout: args.holdout,
    walkSubject: walk.subjectId,
    walk: { source: scrub(String(args.walk)), steps: walk.steps.length },
    outcome,
    verdict,
    pPay: strong?.pPay ?? null,
    objections,
    flipToPay: (strong?.flipToPay ?? []).map(row => ({
      ...row,
      change: scrub(row.change),
    })),
    valueEvidence: (strong?.valueEvidence ?? []).map(row => ({
      ...row,
      what: scrub(row.what),
    })),
    screen:
      screen.status === 'evaluated'
        ? {
            status: screen.status,
            blockers: screen.blockers,
            maxOwnData: screen.maxOwnData,
            maxConcreteBenefit: screen.maxConcreteBenefit,
            usd: screen.usd,
          }
        : { status: screen.status, error: screen.error, usd: screen.usd },
    strong: strong && {
      model: strong.model,
      pPay: strong.pPay,
      spread: strong.spread,
      reason: strong.reason,
      samples: strong.samples,
      coherentSamples: strong.coherentSamples,
      sampleP: strong.sampleP,
      failures: strong.failures.map(scrub),
      costUsd: strong.costUsd,
    },
    cost: {
      screenUsd: Number((screen.usd ?? 0).toFixed(4)),
      strongUsd: Number((strong?.costUsd ?? 0).toFixed(4)),
      totalUsd: Number(((screen.usd ?? 0) + (strong?.costUsd ?? 0)).toFixed(4)),
      durationSec: Math.round((Date.now() - startedAt) / 1000),
    },
  };
  if (args.holdout) {
    // --expect pay marks a positive canary (a walk a real buyer would pay
    // after); default holdouts are known-bad and must come out a clear no.
    receipt.expect = args.expect === 'pay' ? 'pay' : 'no_pay';
    receipt.holdoutHolds =
      receipt.expect === 'pay'
        ? verdict === 'pay'
        : holdoutHolds({
            verdict,
            pPay: receipt.pPay ?? (screenNo ? 0 : null),
          });
  }
  if (args.expectCategories) {
    receipt.objectionRecall = objectionRecall(
      objections,
      args.expectCategories.split(',')
    );
  }
  receipt.id = createHash('sha256')
    .update(canonical(receipt))
    .digest('hex')
    .slice(0, 16);
  const outbound = JSON.stringify(receipt);
  assertNoIdentity(outbound, persona.identityTokens);

  mkdirSync(join(STATE, 'receipts'), { recursive: true });
  writeFileSync(
    join(
      STATE,
      'receipts',
      `${receipt.at.replaceAll(':', '-')}-${receipt.subject}-${receipt.id}.json`
    ),
    `${JSON.stringify(receipt, null, 2)}\n`,
    { mode: 0o600 }
  );
  appendFileSync(
    join(STATE, 'cost.jsonl'),
    `${JSON.stringify({ at: receipt.at, receipt: receipt.id, subject: receipt.subject, tier: persona.tier, holdout: args.holdout, screenUsd: receipt.cost.screenUsd, strongUsd: receipt.cost.strongUsd, totalUsd: receipt.cost.totalUsd, durationSec: receipt.cost.durationSec, strongRan: Boolean(strong) })}\n`
  );

  if (!args.holdout && strong && verdict !== 'pay' && !persona.control) {
    const dir = args.signalsDir ?? join(STATE, 'factory-signals');
    mkdirSync(dir, { recursive: true });
    for (const objection of fileableObjections({ objections })) {
      const signal = factorySignal(receipt, objection);
      assertNoIdentity(JSON.stringify(signal), persona.identityTokens);
      writeFileSync(
        join(dir, `${signal.fingerprint}.json`),
        `${JSON.stringify(signal, null, 2)}\n`
      );
    }
  }
  rmSync(walk.frameDir, { recursive: true, force: true });
  return receipt;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.walk || !args.persona) {
    process.stderr.write(
      'usage: run.mjs --walk <dir|video> --persona <id|file> [--sha s] [--holdout]\n'
    );
    process.exit(2);
  }
  evaluate(args)
    .then(receipt => {
      process.stdout.write(
        `${JSON.stringify({ id: receipt.id, subject: receipt.subject, verdict: receipt.verdict, pPay: receipt.pPay, objections: receipt.objections.map(o => `${o.tSec}s ${o.category}: ${o.text}`), cost: receipt.cost, holdoutHolds: receipt.holdoutHolds, objectionRecall: receipt.objectionRecall }, null, 2)}\n`
      );
    })
    .catch(error => {
      // Any failure is an abstain for the gate; never a pass.
      process.stderr.write(
        `buyer-eval failed (abstain): ${error?.message ?? error}\n`
      );
      process.exit(1);
    });
}
