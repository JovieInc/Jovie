#!/usr/bin/env node
/**
 * Pen PROPOSAL review loop (Tim, 2026-11-01: "a system 1 judge loop or
 * basically all our checks on it ... fully auto").
 *
 *   node scripts/pen-review/run.mjs review --frames rRwHL,TtXhW [--receipts DIR] [--fixer agent|none] [--max-rounds 8]
 *   node scripts/pen-review/run.mjs sweep [--receipts DIR]          # what launchd runs
 *   node scripts/pen-review/run.mjs save --holder NAME [--touched a,b]  # guarded save()
 *   node scripts/pen-review/run.mjs lease acquire|release|status --holder NAME [--token TOKEN]
 *
 * Per frame and round: render (live Pen, font-race retry) -> render guard ->
 * deterministic checks -> System-1 panel -> decide. A material finding sends
 * the top issue to the fixer (headless Claude on the pencil MCP, scoped to
 * that frame) and re-renders. Pass = every check green and two consecutive
 * judge rounds with nothing material; the frame is then renamed with
 * "· ready for Tim r<receipt>". A receipt (checks, verdicts, rounds,
 * before/after PNGs, stage timestamps) is written per frame.
 *
 * Exit: 0 all pass, 1 some frame failed, 3 render untrusted or lease held.
 * State: ~/.local/state/jovie-pen-review/ (lease, sweep state, ledger.jsonl).
 * Kill switch: touch ~/.local/state/jovie-pen-review/disabled.
 */

import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lintCopy } from '../../packages/copy/lint.ts';
import {
  DEAD_END_RULES,
  DEAD_END_TRANSIENT,
} from '../../packages/copy/rules.ts';
import { PATTERNS as CLAIM_PATTERNS } from '../invariants/stat-claims/check.mjs';
import { brandChecks } from './brand-checks.mjs';
import { fixerModel, fixPrompt } from './fixer.mjs';
import { runPanel } from './judges.mjs';
import { runChecks } from './lib.mjs';
import {
  acquireLease,
  DEFAULT_MAX_ROUNDS,
  decideRound,
  foreignUnsaved,
  frameDigest,
  isProposalFrame,
  markReady,
  RECEIPT_SCHEMA,
  readLease,
  releaseLease,
  stripReady,
  withWriterLease,
} from './loop-state.mjs';
import { recordTiming } from './metrics.mjs';
import {
  CANONICAL_PEN,
  frameTrees,
  listFrames,
  readFacts,
  renameFrame,
  saveLive,
  signatures,
} from './pen-bridge.mjs';

import { renderTrusted } from './render-trusted.mjs';
import { MAX_SWEEP_ATTEMPTS, recordSweepAttempt } from './sweep-state.mjs';
import { ownsLease } from './writer-identity.mjs';

export { fixerModel, fixPrompt } from './fixer.mjs';
export { renderTrusted } from './render-trusted.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const STATE_DIR =
  process.env.PEN_REVIEW_STATE ||
  join(homedir(), '.local/state/jovie-pen-review');
export const LEASE_PATH = join(STATE_DIR, 'writer.lease.json');
const LEDGER = join(STATE_DIR, 'ledger.jsonl');

const now = () => new Date().toISOString();
const sha = v => createHash('sha256').update(v).digest('hex');

export function loadBrief(name, path = join(HERE, 'briefs.json')) {
  const cfg = JSON.parse(readFileSync(path, 'utf8'));
  const hit = cfg.briefs.find(b => new RegExp(b.match, 'i').test(name)) ?? {};
  return { ...cfg.defaults, surface: stripReady(name), ...hit };
}

function ledger(event) {
  recordTiming(LEDGER, event);
}

const CHECK_CTX = {
  lintCopy,
  deadEndRules: DEAD_END_RULES,
  deadEndTransient: DEAD_END_TRANSIENT,
  claimPatterns: CLAIM_PATTERNS,
};

/** @param {string} prompt @param {{timeoutMs?: number, model?: string}} [opts] */
export function runFixerAgent(
  prompt,
  { timeoutMs = 12 * 60_000, model = fixerModel(null) } = {}
) {
  const cwd = mkdtempSync(join(tmpdir(), 'pen-fixer-'));
  const res = spawnSync(
    'claude',
    [
      '-p',
      prompt,
      '--model',
      model,
      '--allowedTools',
      'mcp__pencil__execute,mcp__pencil__get_app_state,mcp__pencil__read_skill',
    ],
    { cwd, encoding: 'utf8', timeout: timeoutMs }
  );
  return {
    status: res.status,
    out: String(res.stdout ?? '')
      .trim()
      .slice(-600),
    err: String(res.stderr ?? '')
      .trim()
      .slice(-300),
  };
}
export async function reviewFrame(
  id,
  {
    receiptsDir,
    fixer = 'agent',
    maxRounds = DEFAULT_MAX_ROUNDS,
    holder,
    assertLease = () => {},
  },
  {
    getTrees = frameTrees,
    getFacts = readFacts,
    renderFrame = renderTrusted,
    panelFor = runPanel,
    rename = renameFrame,
    fix = runFixerAgent,
    record = ledger,
  } = {}
) {
  const dir = join(receiptsDir, id);
  mkdirSync(dir, { recursive: true });
  assertLease();
  const [tree] = getTrees([id]);
  if (!tree || tree.missing) throw new Error(`frame ${id} not found`);
  // Invalidate prior certification before any fallible review work.
  if (tree.name !== stripReady(tree.name)) {
    assertLease();
    rename(id, stripReady(tree.name));
  }
  const brief = loadBrief(tree.name);
  const receipt = {
    schema: RECEIPT_SCHEMA,
    frame: { id, name: stripReady(tree.name) },
    brief,
    holder,
    startedAt: now(),
    digestBefore: frameDigest(tree),
    rounds: [],
    verdict: null,
  };
  function finishRound(r) {
    const finishedAt = now();
    receipt.rounds.push({ ...r, finishedAt });
    record({
      stage: 'pen-review-round',
      frame: id,
      round: r.round,
      action: r.decision.action,
      startedAt: r.startedAt,
      finishedAt,
    });
  }
  let quietRounds = 0;
  for (let round = 0; round < maxRounds; round++) {
    assertLease();
    const digest = frameDigest(getTrees([id])[0]);
    if (receipt.rounds.at(-1)?.digest !== digest) quietRounds = 0;
    const r = { round, startedAt: now(), digest };
    const facts = getFacts(id);
    const render = await renderFrame(id, join(dir, `r${round}`), facts);
    assertLease();
    r.render = {
      path: render.path,
      md5: render.md5,
      attempts: render.attempt + 1,
      guard: render.guard,
      renderer: render.renderer,
      stable: render.stable,
    };
    if (round === 0) copyFileSync(render.path, join(dir, 'before.png'));
    if (render.guard.length) {
      r.decision = { action: 'render-untrusted' };
      finishRound(r);
      receipt.verdict = 'render-untrusted';
      break;
    }
    const findings = [
      ...runChecks(facts, {
        ...CHECK_CTX,
        // Product frames show the user's own data ("2 of 14 releases"); the
        // claims ledger governs marketing claims. A brief opts out explicitly.
        ...(brief.claims === false ? { claimPatterns: [] } : {}),
        typeScale: facts.typeScale,
        compact: facts.w <= 430,
      }),
      ...brandChecks(facts),
    ];
    r.checks = {
      blocks: findings.filter(f => f.severity === 'block').length,
      warns: findings.filter(f => f.severity === 'warn').length,
      findings,
    };
    const panel = await panelFor({
      png: render.buf,
      facts,
      brief,
      personas: brief.personas,
    });
    /** @type {any} */
    const gate = panel.gates;
    r.gates = {
      status: gate.status,
      pass: gate.pass,
      failed: gate.failed ?? [],
      rules: Object.fromEntries(
        Object.entries(gate.rules ?? {}).map(([k, v]) => [k, v.pViolation])
      ),
    };
    r.judges = panel.judges;
    // Missing evidence is never quiet: an incomplete panel cannot count toward a pass.
    const decision = decideRound({
      checks: findings,
      gates: gate,
      judges: panel.judges,
      complete: panel.complete,
      quietRounds,
      round,
      maxRounds,
    });
    assertLease();
    quietRounds = decision.quietRounds;
    r.decision = decision;
    if (decision.action === 'fix') {
      if (fixer !== 'agent') {
        finishRound(r);
        receipt.verdict = 'needs-fix';
        receipt.nextFix = decision.topIssue;
        break;
      }
      r.fix = fix(
        fixPrompt({ id, name: tree.name }, decision.topIssue, brief),
        { model: fixerModel(decision.topIssue) }
      );
    }
    finishRound(r);
    if (decision.action === 'pass' || decision.action === 'fail') {
      receipt.verdict = decision.action;
      break;
    }
  }
  receipt.verdict ??= 'fail';
  receipt.finishedAt = now();
  const last = receipt.rounds.at(-1);
  if (last?.render?.path && existsSync(last.render.path))
    copyFileSync(last.render.path, join(dir, 'after.png'));
  const [after] = getTrees([id]);
  receipt.digestAfter = frameDigest(after);
  if (receipt.verdict === 'pass' && receipt.digestAfter !== last?.digest) {
    receipt.verdict = 'fail';
    receipt.failure = 'frame changed after its evaluated render; review again';
  }
  const body = JSON.stringify(receipt, null, 2);
  receipt.receiptHash = sha(body);
  assertLease();
  if (receipt.verdict === 'pass') {
    rename(id, markReady(after.name, receipt.receiptHash));
    receipt.readyMarked = true;
  } else if (after.name !== stripReady(after.name)) {
    rename(id, stripReady(after.name)); // a stale marker never survives a failed review
  }
  writeFileSync(
    join(dir, 'receipt.json'),
    `${JSON.stringify(receipt, null, 2)}\n`
  );
  record({
    stage: 'pen-review-frame',
    frame: id,
    verdict: receipt.verdict,
    rounds: receipt.rounds.length,
    startedAt: receipt.startedAt,
    finishedAt: receipt.finishedAt,
  });
  return receipt;
}

/** PROPOSAL frames (plus the explicit queue) whose content changed since their last review. */
export function sweepTargets({
  statePath = join(STATE_DIR, 'sweep-state.json'),
  queuePath = join(STATE_DIR, 'queue.json'),
} = {}) {
  const state = existsSync(statePath)
    ? JSON.parse(readFileSync(statePath, 'utf8'))
    : {};
  const queued = existsSync(queuePath)
    ? JSON.parse(readFileSync(queuePath, 'utf8'))
    : [];
  const frames = listFrames().filter(
    n => n.d <= 2 && isProposalFrame(n) && n.w <= 2000 && n.h <= 2400
  );
  const ids = [...new Set([...frames.map(f => f.id), ...queued])];
  const trees = frameTrees(ids).filter(t => !t.missing);
  return {
    state,
    statePath,
    targets: trees.filter(t => shouldReview(t, state[t.id])).map(t => t.id),
    trees,
  };
}

/** A changed frame starts fresh; unchanged infrastructure failures get bounded retries. */
export function shouldReview(tree, previous) {
  return (
    previous?.digest !== frameDigest(tree) ||
    (['render-untrusted', 'error'].includes(previous?.verdict) &&
      (previous.attempts ?? 0) < MAX_SWEEP_ATTEMPTS)
  );
}

function arg(argv, name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
}

async function main(argv) {
  const [cmd, sub] = argv;
  let holder = arg(
    argv,
    'holder',
    process.env.PEN_REVIEW_HOLDER || 'pen-review-loop'
  );
  if (existsSync(join(STATE_DIR, 'disabled')) && cmd !== 'lease') {
    console.log('pen-review disabled (kill switch)');
    return cmd === 'save' ? 3 : 0;
  }
  if (cmd === 'lease') {
    if (sub === 'acquire')
      return report(
        acquireLease(LEASE_PATH, {
          holder,
          scope: arg(argv, 'scope', 'proposal-frames'),
          token: arg(argv, 'token', randomUUID()),
        }),
        r => (r.ok ? 0 : 3)
      );
    if (sub === 'release')
      return report(
        { released: releaseLease(LEASE_PATH, holder, arg(argv, 'token')) },
        r => (r.released ? 0 : 3)
      );
    return report(readLease(LEASE_PATH), () => 0);
  }
  if (cmd === 'save') {
    const lease = readLease(LEASE_PATH);
    if (
      !ownsLease(lease, holder, arg(argv, 'token')) ||
      !(Date.parse(lease.expiresAt) > Date.now())
    )
      return report(
        {
          saved: false,
          reason: 'caller does not hold the writer lease',
          lease,
        },
        () => 3
      );
    const scratch = mkdtempSync(join(tmpdir(), 'pen-disk-'));
    const disk = join(scratch, 'disk.lib.pen');
    copyFileSync(CANONICAL_PEN, disk);
    const foreign = foreignUnsaved(
      signatures(),
      signatures({ inFile: disk, outFile: join(scratch, 'out.pen') }),
      new Set((arg(argv, 'touched', '') || '').split(',').filter(Boolean))
    );
    if (foreign.length)
      return report(
        {
          saved: false,
          reason: 'unsaved changes owned by another writer',
          foreign,
        },
        () => 3
      );
    return report(saveLive({ statFile: () => statSync(CANONICAL_PEN) }), r =>
      r.persisted ? 0 : 1
    );
  }
  const receiptsDir = resolve(
    arg(argv, 'receipts', join(STATE_DIR, 'receipts'))
  );
  if (cmd !== 'review' && cmd !== 'sweep')
    throw new Error('expected review, sweep, save or lease');
  // A holder label is not a process identity: concurrent invocations get distinct leases.
  holder = `${holder}:${randomUUID()}`;
  const result = await withWriterLease(
    LEASE_PATH,
    {
      holder,
      scope: 'proposal-frames',
      ttlMs: 60 * 60_000,
    },
    async assertLease => {
      const opts = {
        receiptsDir: join(receiptsDir, randomUUID()),
        assertLease,
        fixer: arg(argv, 'fixer', 'agent'),
        maxRounds: Number(arg(argv, 'max-rounds', DEFAULT_MAX_ROUNDS)),
        holder,
      };
      let ids = (arg(argv, 'frames', '') || '').split(',').filter(Boolean);
      let sweep;
      if (cmd === 'sweep') {
        sweep = sweepTargets();
        ids = sweep.targets;
      }
      const results = [];
      for (const id of ids) {
        const startedAt = now();
        let rec;
        try {
          rec = await reviewFrame(id, opts);
        } catch (error) {
          // One frame's infrastructure failure never stops the batch.
          ledger({
            stage: 'pen-review-frame',
            startedAt,
            frame: id,
            verdict: 'error',
            error: String(error.message).slice(0, 200),
            finishedAt: now(),
          });
          results.push({
            id,
            verdict: 'error',
            error: String(error.message).slice(0, 200),
          });
          recordSweepAttempt(sweep, id, { verdict: 'error' });
          continue;
        }
        results.push({
          id,
          name: rec.frame.name,
          verdict: rec.verdict,
          rounds: rec.rounds.length,
          nextFix: rec.nextFix?.message,
        });
        recordSweepAttempt(sweep, id, rec);
      }
      return { results };
    }
  );
  if (result.skipped) return report(result, () => 3);
  return report(result, r =>
    r.results.some(x => x.verdict === 'render-untrusted')
      ? 3
      : r.results.every(x => x.verdict === 'pass')
        ? 0
        : 1
  );
}

function report(value, code) {
  console.log(JSON.stringify(value, null, 2));
  return code(value);
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    code => process.exit(code),
    error => {
      console.error(String(error?.stack ?? error));
      process.exit(2);
    }
  );
}
