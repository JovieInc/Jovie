#!/usr/bin/env node
// One entry point for every agent-built output (canon: JovieInc/ci canon/OUTPUT-QUALITY-LOOP.md).
//
//   jovie output check <artifact|url> --kind memo|social|video|deck|ui|email|sms|doc|artifact|investor
//        --mission "<one line>" (--audience "<who>" | --preset tim|customer|vendor|investor|buyer)
//        [--text "<inline>"] [--fix none|auto|cmd:<shell>] [--max-passes 3] [--register <copy register>]
//        [--no-intent] [--no-screenshots] [--json]
//
// Runs the audience-intent loop (intent-eval.mjs), then the deterministic
// gates (gates.mjs: copy lint, slop, design tokens + Clef design rules, claims
// ledger, privacy) on the final artifact, and writes one receipt. policy.json
// decides warn vs blocking; it flips to blocking only after calibrate.mjs
// passes on the known-good and known-bad fixtures.

import { randomUUID } from 'node:crypto';
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runGates } from './gates.mjs';
import {
  RECEIPT_SCHEMA as INTENT_SCHEMA,
  receiptLine,
  runIntentLoop,
  STATE,
  summarize,
} from './intent-eval.mjs';
import { renderArtifact } from './render.mjs';

export const CHECK_SCHEMA = 'jovie.output-check/v1';
export const POLICY = JSON.parse(
  readFileSync(new URL('./policy.json', import.meta.url), 'utf8')
);

/** Overall verdict: any failed gate or a non-passing intent eval fails the output. */
export function verdictFor(gates, intent) {
  if (gates.some(gate => gate.status === 'fail')) return 'fail';
  if (intent && intent.verdict !== 'pass')
    return intent.verdict === 'abstain' ? 'abstain' : 'fail';
  return 'pass';
}

export async function outputCheck({
  artifact,
  text,
  kind,
  mission,
  audience,
  preset,
  stakes,
  register,
  fix = 'none',
  maxPasses,
  intent: withIntent = true,
  screenshots = true,
  viewports,
  state = STATE,
  mode = POLICY.mode,
  loop = runIntentLoop,
  render = renderArtifact,
  gates = runGates,
  now = () => new Date(),
}) {
  if (!kind) throw new Error('--kind is required');
  const startedAt = now();
  const intent = withIntent
    ? await loop({
        mission,
        audience,
        artifact,
        text,
        kind,
        preset,
        stakes,
        fix,
        maxPasses,
        viewports,
        state,
      })
    : null;
  const id =
    intent?.runId ??
    `${startedAt.toISOString().replace(/[-:.]/gu, '').slice(0, 15)}-${randomUUID().slice(0, 8)}`;
  const finalRef = intent?.final.path ?? artifact;
  const rendered = await render({
    ref: finalRef,
    ...(finalRef ? {} : { text }),
    outDir: join(state, 'runs', id, 'gates-render'),
    viewports,
  });
  const gateResults = await gates({ rendered, kind, register, screenshots });
  const endedAt = now();
  const verdict = verdictFor(gateResults, intent);
  const receipt = {
    schema: CHECK_SCHEMA,
    runId: id,
    kind,
    mode,
    verdict,
    blocking: mode === 'enforce' && verdict !== 'pass',
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    ms: endedAt.getTime() - startedAt.getTime(),
    artifact: {
      input: artifact ?? 'inline',
      final: finalRef ?? 'inline',
      sha256: rendered.sha256,
    },
    gates: gateResults,
    intent: intent
      ? {
          schema: INTENT_SCHEMA,
          runId: intent.runId,
          verdict: intent.verdict,
          score: intent.score,
          passCount: intent.passCount,
          line: receiptLine(intent),
        }
      : null,
  };
  mkdirSync(join(state, 'runs', id), { recursive: true });
  writeFileSync(
    join(state, 'runs', id, 'output-check.json'),
    JSON.stringify(receipt, null, 2)
  );
  appendFileSync(
    join(state, 'checks.jsonl'),
    `${JSON.stringify({ schema: `${CHECK_SCHEMA}#check`, runId: id, kind, mode, verdict, startedAt: receipt.startedAt, endedAt: receipt.endedAt, ms: receipt.ms, gates: Object.fromEntries(gateResults.map(g => [g.id, g.status])), intent: receipt.intent?.verdict ?? null, intentPasses: receipt.intent?.passCount ?? 0 })}\n`
  );
  return { receipt, intent };
}

/** The receipt line a PR body or Summer's send ledger carries. */
export function checkLine(receipt) {
  const gates = receipt.gates.map(g => `${g.id}:${g.status}`).join(',');
  const intent = receipt.intent
    ? `${receipt.intent.verdict}(${receipt.intent.score ?? 'n/a'},${receipt.intent.passCount}p)`
    : 'skipped';
  return `Output-check: ${CHECK_SCHEMA} run=${receipt.runId} verdict=${receipt.verdict} mode=${receipt.mode} gates=${gates} intent=${intent} sha256=${receipt.artifact.sha256.slice(0, 12)}`;
}

export function parseArgs(argv) {
  const args = { intent: true, screenshots: true, json: false };
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    if (!raw.startsWith('--')) {
      args.artifact ??= raw;
      continue;
    }
    const key = raw.slice(2).replace(/-(\w)/gu, (_, c) => c.toUpperCase());
    if (key === 'noIntent') args.intent = false;
    else if (key === 'noScreenshots') args.screenshots = false;
    else if (key === 'json') args.json = true;
    else args[key] = argv[++i];
  }
  if (args.maxPasses) args.maxPasses = Number(args.maxPasses);
  if (typeof args.viewports === 'string')
    args.viewports = args.viewports.split(',');
  return args;
}

/** Exit 1 only when the policy is enforcing and the output does not pass. */
export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const { receipt, intent } = await outputCheck(args);
  if (args.json)
    process.stdout.write(
      `${JSON.stringify({ ...receipt, intentReceipt: intent }, null, 2)}\n`
    );
  else {
    const lines = [checkLine(receipt)];
    for (const gate of receipt.gates)
      for (const f of gate.findings.slice(0, 8))
        lines.push(
          `  ${gate.id} ${f.severity}: ${f.message}${f.match ? ` [${f.match}]` : ''}`
        );
    if (intent) lines.push(summarize(intent));
    if (receipt.verdict !== 'pass' && !receipt.blocking)
      lines.push(
        `  warn mode: this would block once policy.json is enforcing.`
      );
    process.stdout.write(`${lines.join('\n')}\n`);
  }
  return receipt.blocking ? 1 : 0;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().then(
    code => process.exit(code),
    error => {
      process.stderr.write(`output-check: ${error?.message ?? error}\n`);
      process.exit(2);
    }
  );
