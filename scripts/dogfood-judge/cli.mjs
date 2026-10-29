#!/usr/bin/env node
// LLM dogfood judge CLI. Every recorded agent run is watched and judged by
// vision models against the Tim-taste rubric before it may reach Tim or a
// real user.
//
//   judge      --surface <id> --run <dir> [--out <dir>] [--sha <40hex>] [--confirm-all] [--propose [live]]
//   gate       --surface <id> [--sha <40hex>]        exit 0 allow, 1 deny (fail closed)
//   coverage   [--json] [--next]                      judged-surface coverage + expansion queue
//   invalidate --before <bindings.json|git-ref>       model change -> re-record/re-judge plan
//   bindings                                          current resolved model bindings
//   calibrate  [--cases <jsonl>] [--publish]          precision/recall vs Tim's verdicts
//   publish    [--prod-sha <40hex>] [--post] [--origin <url>]   ledger for the waitlist gate (#23720)
//   miss       --id <slug> --image <file> --words "<Tim>" --criteria TT-xx[,..] [--surface <id>]
//
// Ledger: $DOGFOOD_JUDGE_LEDGER or .context/dogfood-judge/ledger (receipts per surface).

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { calibrate, publishMetrics, recordMiss } from './calibrate.mjs';
import { ingestRun } from './ingest.mjs';
import { judgeRun } from './judge.mjs';
import { buildLedger, designLegDecision, postLedger } from './publish.mjs';
import {
  admissionRecord,
  buildReceipt,
  DEFAULT_LEDGER,
  gateDecision,
  qaSwarmFindings,
  readLatestReceipts,
  remediationEvents,
  signReceipt,
  visualProofReceipt,
  writeReceipt,
} from './receipt.mjs';
import {
  coverage,
  invalidationPlan,
  REPO_ROOT,
  readSurfaces,
  resolveBindings,
} from './registry.mjs';
import { renderReport } from './report.mjs';

function args(argv) {
  /** @type {Record<string, any>} */
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) out[key] = true;
      else {
        out[key] = next;
        i += 1;
      }
    } else out._.push(a);
  }
  return out;
}

const ledgerDir = () =>
  resolve(REPO_ROOT, process.env.DOGFOOD_JUDGE_LEDGER ?? DEFAULT_LEDGER);
const log = line => process.stderr.write(`[dogfood-judge] ${line}\n`);

function surfaceOrDie(registry, id) {
  const surface = registry.surfaces.find(s => s.id === id);
  if (!surface) {
    log(
      `unknown surface ${id}; known: ${registry.surfaces.map(s => s.id).join(', ')}`
    );
    process.exit(2);
  }
  return surface;
}

const withAbsPen = surface =>
  (surface.penRefs ?? []).map(ref => ({
    ...ref,
    absPath: ref.path ? resolve(REPO_ROOT, ref.path) : null,
  }));

async function cmdJudge(opts) {
  const registry = readSurfaces();
  const surface = surfaceOrDie(registry, opts.surface);
  if (!opts.run) throw new Error('--run <dir> is required');
  const runId = `${surface.id}-${new Date().toISOString().replace(/[:.]/gu, '-')}`;
  const outDir = resolve(
    opts.out ?? join(REPO_ROOT, '.context/dogfood-judge/runs', runId)
  );
  mkdirSync(outDir, { recursive: true });
  const t0 = Date.now();
  const manifest = ingestRun({
    runDir: opts.run,
    outDir,
    surface: surface.title,
  });
  writeFileSync(
    join(outDir, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  log(
    `ingested ${manifest.steps.length} steps, ${manifest.unjudgeable.length} unrecorded (${Date.now() - t0}ms)`
  );
  const penRefs = withAbsPen(surface);
  const t1 = Date.now();
  const result = await judgeRun({
    manifest,
    penRefs,
    tiers: registry.judge.tiers,
    outDir,
    confirmAll: Boolean(opts['confirm-all']),
    log,
  });
  const resolved = resolveBindings(registry);
  const receipt = signReceipt(
    buildReceipt({
      surface,
      result,
      manifest,
      resolved,
      sourceSha: opts.sha ?? null,
      runId,
    })
  );
  if (!receipt.signature)
    log(
      'DOGFOOD_JUDGE_SIGNING_KEY not set: receipt is unsigned and will not admit anyone'
    );
  const timings = { ingestMs: t1 - t0, judgeMs: Date.now() - t1 };
  const receiptPath = writeReceipt(receipt, ledgerDir());
  writeFileSync(
    join(outDir, 'receipt.json'),
    `${JSON.stringify(receipt, null, 2)}\n`
  );
  writeFileSync(
    join(outDir, 'admission.json'),
    `${JSON.stringify(admissionRecord(receipt), null, 2)}\n`
  );
  writeFileSync(
    join(outDir, 'visual-proof.json'),
    `${JSON.stringify(visualProofReceipt(receipt), null, 2)}\n`
  );
  const events = remediationEvents(receipt);
  writeFileSync(
    join(outDir, 'remediation.jsonl'),
    events.map(e => JSON.stringify(e)).join('\n') + (events.length ? '\n' : '')
  );
  const findingsPath = join(outDir, 'findings.json');
  writeFileSync(
    findingsPath,
    `${JSON.stringify(qaSwarmFindings(receipt, events), null, 2)}\n`
  );
  if (opts.propose && events.length) {
    // Event-driven remediation: every finding becomes an issue; P0s get a coder manifest.
    const proposeArgs = [
      'scripts/qa-swarm/cli.mjs',
      'propose',
      '--recipe',
      'vision-critique',
      '--input',
      findingsPath,
    ];
    if (opts.propose !== 'live') proposeArgs.push('--dry-run');
    try {
      execFileSync('node', proposeArgs, {
        cwd: REPO_ROOT,
        stdio: ['ignore', 'pipe', 'inherit'],
      });
      log(
        `proposed ${events.length} remediation event(s) (${opts.propose === 'live' ? 'live' : 'dry-run'})`
      );
    } catch (error) {
      log(`propose failed: ${String(error?.message ?? error).slice(0, 300)}`);
    }
  }
  const reportPath = join(outDir, 'report.html');
  writeFileSync(
    reportPath,
    renderReport({ receipt, penRefs, title: `Dogfood judge: ${surface.title}` })
  );
  process.stdout.write(
    `${JSON.stringify({ timings, nothingWrong: receipt.signoff.nothingWrong, signed: Boolean(receipt.signature), verdict: receipt.verdict, costUsd: receipt.costUsd, steps: receipt.steps.length, findings: events.length, blockers: events.filter(e => e.severity === 'blocker').length, receipt: receiptPath, report: reportPath, remediation: join(outDir, 'remediation.jsonl') }, null, 2)}\n`
  );
  return receipt.verdict === 'pass' ? 0 : 1;
}

function cmdGate(opts) {
  const registry = readSurfaces();
  const surface = registry.surfaces.find(s => s.id === opts.surface);
  const receipt = readLatestReceipts(ledgerDir())[opts.surface] ?? null;
  const decision = gateDecision({
    receipt,
    surface,
    resolved: resolveBindings(registry),
    maxAgeDays: registry.judge.maxReceiptAgeDays,
    sourceSha: opts.sha ?? null,
  });
  process.stdout.write(
    `${JSON.stringify({ surface: opts.surface, ...decision }, null, 2)}\n`
  );
  return decision.allow ? 0 : 1;
}

function cmdCoverage(opts) {
  const registry = readSurfaces();
  const report = coverage(
    registry,
    readLatestReceipts(ledgerDir()),
    resolveBindings(registry)
  );
  if (opts.json || opts.next) {
    process.stdout.write(
      `${JSON.stringify(opts.next ? { next: report.next, blockedExpansionBy: report.blockedExpansionBy } : report, null, 2)}\n`
    );
  } else {
    process.stdout.write(
      `coverage ${(report.coverage * 100).toFixed(0)}% (${report.green}/${report.total} green, ${report.judged} judged)\n`
    );
    for (const row of report.rows)
      process.stdout.write(
        `${row.green ? 'green' : row.status.padEnd(6)} ${String(row.roiScore).padStart(3)} ${row.id}${row.stale.length ? `  [${row.stale.join(', ')}]` : ''}\n`
      );
    process.stdout.write(
      report.next
        ? `next to promote: ${report.next}\n`
        : `expansion blocked by: ${report.blockedExpansionBy.join(', ') || 'nothing judged yet'}\n`
    );
  }
  return 0;
}

/** Bindings at a git ref (for push-event invalidation) or from a JSON file. */
function bindingsAt(ref) {
  if (ref.endsWith('.json')) return JSON.parse(readFileSync(ref, 'utf8'));
  const dir = join(
    REPO_ROOT,
    '.context/dogfood-judge/at',
    ref.replace(/\W+/gu, '_')
  );
  mkdirSync(dir, { recursive: true });
  const files = [
    'scripts/dogfood-judge/surfaces.json',
    'ops/registry/capacity.json',
    'apps/web/lib/constants/ai-models.ts',
  ];
  for (const file of files) {
    mkdirSync(join(dir, file, '..'), { recursive: true });
    try {
      writeFileSync(
        join(dir, file),
        execFileSync('git', ['show', `${ref}:${file}`], {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          maxBuffer: 32 * 1024 * 1024,
        })
      );
    } catch {
      writeFileSync(join(dir, file), file.endsWith('.json') ? '{}' : '');
    }
  }
  let registry;
  try {
    registry = readSurfaces(dir);
  } catch {
    registry = readSurfaces();
  }
  if (!registry.bindingSources) registry = readSurfaces();
  return resolveBindings(registry, dir);
}

function cmdInvalidate(opts) {
  if (!opts.before)
    throw new Error('--before <git-ref|bindings.json> is required');
  const registry = readSurfaces();
  const plan = invalidationPlan(
    registry,
    bindingsAt(opts.before),
    resolveBindings(registry)
  );
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  return 0;
}

async function cmdPublish(opts) {
  const registry = readSurfaces();
  const ledger = buildLedger({
    registry,
    receipts: readLatestReceipts(ledgerDir()),
    resolved: resolveBindings(registry),
  });
  const decision = designLegDecision(ledger, opts['prod-sha'] ?? null);
  let posted = null;
  if (opts.post)
    posted = await postLedger(ledger, {
      origin: opts.origin ?? 'https://jov.ie',
    });
  process.stdout.write(
    `${JSON.stringify({ ledger, gateDecision: decision, posted }, null, 2)}\n`
  );
  return 0;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const opts = args(rest);
  switch (cmd) {
    case 'judge':
      return cmdJudge(opts);
    case 'gate':
      return cmdGate(opts);
    case 'coverage':
      return cmdCoverage(opts);
    case 'invalidate':
      return cmdInvalidate(opts);
    case 'publish':
      return cmdPublish(opts);
    case 'bindings':
      process.stdout.write(
        `${JSON.stringify(resolveBindings(readSurfaces()), null, 2)}\n`
      );
      return 0;
    case 'calibrate': {
      const metrics = await calibrate({
        casesPath: opts.cases,
        only: opts.only,
        log,
      });
      if (opts.publish) publishMetrics(metrics, log);
      process.stdout.write(`${JSON.stringify(metrics.summary, null, 2)}\n`);
      return metrics.summary.meetsFloors ? 0 : 1;
    }
    case 'miss':
      process.stdout.write(`${JSON.stringify(recordMiss(opts), null, 2)}\n`);
      return 0;
    default:
      process.stderr.write(
        readFileSync(new URL(import.meta.url), 'utf8')
          .split('\n')
          .slice(1, 16)
          .join('\n') + '\n'
      );
      return 2;
  }
}

main().then(
  code => process.exit(code),
  error => {
    log(error?.stack ?? String(error));
    process.exit(2);
  }
);
