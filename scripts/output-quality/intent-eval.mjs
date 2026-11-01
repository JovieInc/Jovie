#!/usr/bin/env node
// Audience-intent eval: the one closed loop every agent output goes through
// (canon: JovieInc/ci canon/OUTPUT-QUALITY-LOOP.md).
//
//   jovie eval intent --mission "<one line>" --audience "<who>" --artifact <file|url|image|video>
//        [--text "<inline text>"] [--preset tim|customer|vendor|investor|buyer]
//        [--kind memo|social|video|deck|ui|email|sms|doc|artifact] [--stakes routine|high]
//        [--fix none|auto|cmd:<shell>] [--max-passes 3] [--viewports desktop,mobile] [--json]
//
// Render the artifact, have a judge role-play the audience, return pass/fail,
// score, the top issue and the single most impactful change. With --fix it
// loops (fix -> re-eval) until pass or the pass budget, then reports what is
// left honestly. Every pass is appended to passes.jsonl with entry and exit
// timestamps; the run receipt is runs/<id>/receipt.json under
// $INTENT_EVAL_STATE (default ~/.local/state/jovie-intent-eval, never the repo).

import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  contentFor,
  encodeImages,
  MAX_IMAGES_PER_REQUEST,
  routeFor,
  sampleJudge,
} from './judge-core.mjs';
import { renderArtifact } from './render.mjs';
import {
  aggregateIntent,
  buildFixPrompt,
  buildIntentPrompt,
  FIX_SCHEMA,
  INTENT_SCHEMA,
  PRESETS,
  parseIntentSample,
  RUBRIC_VERSION,
  resolveStakes,
} from './rubric.mjs';

export const RECEIPT_SCHEMA = 'jovie.intent-eval/v1';
export const ROUTES = Object.freeze({
  routine: 'dev.intent-eval',
  high: 'dev.intent-eval-strong',
});
export const DEFAULT_MAX_PASSES = 3;
export const STATE =
  process.env.INTENT_EVAL_STATE ??
  join(homedir(), '.local/state/jovie-intent-eval');

/**
 * The sanctioned route for a stakes level. Routine: one system-1 sample on the
 * Workers AI vision model. High (investor, legal, public launch): three
 * independent samples, the stronger text model when there are no images, and
 * at least two coherent samples to count.
 */
export function planRoute(stakes, hasImages, routing) {
  const route = routeFor(ROUTES[stakes], routing);
  const vision =
    route.models.find(model => /flash/u.test(model)) ?? route.models[0];
  const text =
    route.models.find(model => !/flash/u.test(model)) ?? route.models[0];
  return stakes === 'high'
    ? {
        id: route.id,
        model: hasImages ? vision : text,
        fixModel: text,
        samples: 3,
        minSamples: 2,
      }
    : {
        id: route.id,
        model: hasImages ? vision : route.models[0],
        fixModel: text,
        samples: 1,
        minSamples: 1,
      };
}

/** One evaluation of one rendered artifact. */
export async function judgeOnce({
  rendered,
  mission,
  audience,
  kind,
  stakes,
  routing,
  call,
  encode = encodeImages,
}) {
  const images = rendered.images.slice(0, MAX_IMAGES_PER_REQUEST);
  const route = planRoute(stakes, images.length > 0, routing);
  const prompt = buildIntentPrompt({
    mission,
    audience,
    kind,
    text: rendered.text,
    imageCount: images.length,
  });
  const content = contentFor(
    prompt,
    images.map(image => ({ label: image.label, ...encode([image.path]) }))
  );
  const ask = samples =>
    sampleJudge({
      model: route.model,
      prompt,
      content,
      schema: INTENT_SCHEMA,
      schemaName: 'audience_intent',
      samples,
      parse: parseIntentSample,
      ...(call ? { call } : {}),
    });
  const result = await ask(route.samples);
  // One retry round for samples lost to truncation or transport (measured
  // 2026-11-01: a reasoning model ran out of tokens on 1 of 2 routine passes).
  if (result.samples.length < route.minSamples) {
    const retry = await ask(route.minSamples - result.samples.length);
    result.samples.push(...retry.samples);
    result.failures.push(...retry.failures);
    result.costUsd += retry.costUsd;
  }
  return {
    route: route.id,
    model: route.model,
    ...aggregateIntent(result.samples, {
      stakes,
      minSamples: route.minSamples,
    }),
    samples: result.samples.length,
    failures: result.failures,
    costUsd: result.costUsd,
  };
}

/** Built-in reviser for text and HTML artifacts: apply the judge's single change. */
export async function autoFix({
  path,
  type,
  mission,
  audience,
  judgement,
  stakes,
  routing,
  call,
}) {
  if (type !== 'text' && type !== 'html')
    throw new Error(
      `--fix auto revises text and HTML only; use --fix cmd:<shell> for ${type}`
    );
  const body = readFileSync(path, 'utf8');
  if (body.length > 40_000)
    throw new Error(
      'artifact too large for --fix auto (40k chars); use --fix cmd:<shell>'
    );
  const route = planRoute(stakes, false, routing);
  const prompt = buildFixPrompt({ mission, audience, type, body, judgement });
  const result = await sampleJudge({
    model: route.fixModel,
    prompt,
    content: contentFor(prompt),
    schema: FIX_SCHEMA,
    schemaName: 'artifact_revision',
    samples: 1,
    ...(call ? { call } : {}),
  });
  const revision = result.samples[0];
  if (!revision?.revised?.trim())
    throw new Error(`reviser returned nothing: ${result.failures.join('; ')}`);
  return {
    body: revision.revised,
    whatChanged: String(revision.what_changed ?? ''),
    costUsd: result.costUsd,
  };
}

/** External fixer: a shell command that edits the artifact in place, or writes INTENT_EVAL_OUT. */
function commandFix({ command, path, feedbackPath, outPath }) {
  const run = spawnSync('sh', ['-c', command], {
    stdio: 'inherit',
    env: {
      ...process.env,
      INTENT_EVAL_ARTIFACT: path,
      INTENT_EVAL_FEEDBACK: feedbackPath,
      INTENT_EVAL_OUT: outPath,
    },
  });
  if (run.status !== 0) throw new Error(`fix command exited ${run.status}`);
  return {
    body: readFileSync(existsSync(outPath) ? outPath : path),
    whatChanged: `ran ${command}`,
    costUsd: 0,
  };
}

function record(state, row) {
  mkdirSync(state, { recursive: true });
  appendFileSync(join(state, 'passes.jsonl'), `${JSON.stringify(row)}\n`);
}

/**
 * The closed loop: evaluate, fix the top issue, re-evaluate, until pass or
 * the pass budget. Returns the receipt (also written to disk).
 */
export async function runIntentLoop({
  mission,
  audience,
  artifact,
  text,
  kind = 'artifact',
  preset,
  stakes: requestedStakes,
  fix = 'none',
  maxPasses = DEFAULT_MAX_PASSES,
  viewports = ['desktop'],
  state = STATE,
  routing,
  call,
  render = renderArtifact,
  encode,
  now = () => new Date(),
}) {
  const presetRow = preset ? PRESETS[preset] : null;
  if (preset && !presetRow)
    throw new Error(
      `unknown preset ${preset}; one of ${Object.keys(PRESETS).join(', ')}`
    );
  const who = audience || presetRow?.audience;
  const goal = mission || presetRow?.mission;
  if (!goal?.trim())
    throw new Error(
      '--mission is required: one line saying what the artifact must achieve'
    );
  if (!who?.trim()) throw new Error('--audience (or --preset) is required');
  const stakes = resolveStakes({ stakes: requestedStakes, kind, preset });
  const runId = `${now().toISOString().replace(/[-:.]/gu, '').slice(0, 15)}-${randomUUID().slice(0, 8)}`;
  const runDir = join(state, 'runs', runId);
  mkdirSync(runDir, { recursive: true });
  // Work on a copy so the loop never edits the caller's file until it passes.
  let current =
    artifact && !/^https?:\/\//iu.test(artifact)
      ? join(runDir, `pass-1${extname(artifact) || '.txt'}`)
      : artifact;
  if (artifact && current !== artifact)
    copyFileSync(resolve(artifact), current);
  if (text !== undefined) {
    current = join(runDir, 'pass-1.txt');
    writeFileSync(current, text);
  }
  const passes = [];
  let costUsd = 0;
  for (let n = 1; n <= maxPasses; n++) {
    const startedAt = now();
    const rendered = await render({
      ref: current,
      outDir: join(runDir, `pass-${n}-render`),
      viewports,
    });
    const judgement = await judgeOnce({
      rendered,
      mission: goal,
      audience: who,
      kind,
      stakes,
      routing,
      call,
      encode,
    });
    costUsd += judgement.costUsd;
    const endedAt = now();
    const pass = {
      n,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      ms: endedAt.getTime() - startedAt.getTime(),
      artifactSha256: rendered.sha256,
      artifactPath: current,
      images: rendered.images.map(image => image.path),
      ...judgement,
    };
    passes.push(pass);
    record(state, {
      schema: `${RECEIPT_SCHEMA}#pass`,
      runId,
      kind,
      stakes,
      mission: goal,
      ...pass,
      images: pass.images.length,
    });
    if (judgement.verdict !== 'fail' || n === maxPasses || fix === 'none')
      break;
    const nextPath = join(runDir, `pass-${n + 1}${extname(current) || '.txt'}`);
    const feedbackPath = join(runDir, `pass-${n}-feedback.json`);
    writeFileSync(
      feedbackPath,
      JSON.stringify({ mission: goal, audience: who, ...judgement }, null, 2)
    );
    try {
      const revised =
        fix === 'auto'
          ? await autoFix({
              path: current,
              type: rendered.type,
              mission: goal,
              audience: who,
              judgement,
              stakes,
              routing,
              call,
            })
          : commandFix({
              command: fix.replace(/^cmd:/u, ''),
              path: current,
              feedbackPath,
              outPath: nextPath,
            });
      costUsd += revised.costUsd;
      writeFileSync(nextPath, revised.body);
      pass.fix = revised.whatChanged;
      current = nextPath;
    } catch (error) {
      pass.fix = `fix failed: ${String(error?.message ?? error).slice(0, 200)}`;
      break;
    }
  }
  const last = passes.at(-1);
  const receipt = {
    schema: RECEIPT_SCHEMA,
    rubric: RUBRIC_VERSION,
    runId,
    kind,
    stakes,
    mission: goal,
    audience: who,
    preset: preset ?? null,
    input: artifact ?? 'inline',
    final: { path: last.artifactPath, sha256: last.artifactSha256 },
    verdict: last.verdict,
    score: last.score,
    passCount: passes.length,
    startedAt: passes[0].startedAt,
    endedAt: last.endedAt,
    costUsd: Number(costUsd.toFixed(5)),
    remaining: last.verdict === 'pass' ? [] : last.remaining,
    passes,
  };
  writeFileSync(join(runDir, 'receipt.json'), JSON.stringify(receipt, null, 2));
  return receipt;
}

/** The one line a PR body or a message ledger carries as proof. */
export function receiptLine(receipt) {
  const clean = value => String(value).replace(/["\n]/gu, ' ').slice(0, 120);
  return `Intent-eval: ${RECEIPT_SCHEMA} run=${receipt.runId} verdict=${receipt.verdict} score=${receipt.score ?? 'n/a'} passes=${receipt.passCount} sha256=${receipt.final.sha256.slice(0, 12)} mission="${clean(receipt.mission)}"`;
}

export function summarize(receipt) {
  const lines = [receiptLine(receipt)];
  for (const pass of receipt.passes)
    lines.push(
      `  pass ${pass.n}: ${pass.verdict} score=${pass.score ?? 'n/a'} (${pass.model}, ${pass.ms}ms) top issue: ${pass.topIssue}${pass.failures?.length ? `\n    judge failures: ${pass.failures.join('; ')}` : ''}${pass.fix ? `\n    fix: ${pass.fix}` : ''}`
    );
  if (receipt.verdict !== 'pass') {
    lines.push(
      `  NOT PASSING after ${receipt.passCount} pass(es). Next change: ${receipt.passes.at(-1).change}`
    );
    for (const issue of receipt.remaining.slice(0, 5))
      lines.push(`  remaining: ${issue}`);
  }
  lines.push(`  final artifact: ${receipt.final.path}`);
  return lines.join('\n');
}

export function parseArgs(argv) {
  const args = {
    fix: 'none',
    maxPasses: DEFAULT_MAX_PASSES,
    viewports: ['desktop'],
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
      .replace(/^--/u, '')
      .replace(/-(\w)/gu, (_, c) => c.toUpperCase());
    if (key === 'json') args.json = true;
    else args[key] = argv[++i];
  }
  args.maxPasses = Number(args.maxPasses) || DEFAULT_MAX_PASSES;
  if (typeof args.viewports === 'string')
    args.viewports = args.viewports.split(',');
  return args;
}

/** Exit 0 pass, 1 fail, 3 abstain (judge unavailable: never a pass). */
export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const receipt = await runIntentLoop(args);
  process.stdout.write(
    `${args.json ? JSON.stringify(receipt, null, 2) : summarize(receipt)}\n`
  );
  return receipt.verdict === 'pass' ? 0 : receipt.verdict === 'abstain' ? 3 : 1;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().then(
    code => process.exit(code),
    error => {
      process.stderr.write(`intent-eval: ${error?.message ?? error}\n`);
      process.exit(2);
    }
  );
