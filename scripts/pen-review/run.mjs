#!/usr/bin/env node
/**
 * Pen PROPOSAL review loop (Tim, 2026-11-01: "a system 1 judge loop or
 * basically all our checks on it ... fully auto").
 *
 *   node scripts/pen-review/run.mjs review --frames rRwHL,TtXhW [--receipts DIR] [--fixer agent|none] [--max-rounds 8]
 *   node scripts/pen-review/run.mjs sweep [--receipts DIR]          # what launchd runs
 *   node scripts/pen-review/run.mjs save --holder NAME [--touched a,b]  # guarded save()
 *   node scripts/pen-review/run.mjs lease acquire|release|status --holder NAME
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
import { createHash } from 'node:crypto';
import {
  appendFileSync,
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
import { decodePng } from '../invariants/pen-still-diff-lib.mjs';
import { PATTERNS as CLAIM_PATTERNS } from '../invariants/stat-claims/check.mjs';
import { brandChecks } from './brand-checks.mjs';
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
} from './loop-state.mjs';
import {
  CANONICAL_PEN,
  exportFramesHeadless,
  frameTrees,
  listFrames,
  readFacts,
  renameFrame,
  runPen,
  saveLive,
  signatures,
} from './pen-bridge.mjs';
import { renderGuard } from './render-guard.mjs';
import { renderHtmlFiles } from './render-html.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const STATE_DIR =
  process.env.PEN_REVIEW_STATE ||
  join(homedir(), '.local/state/jovie-pen-review');
export const LEASE_PATH = join(STATE_DIR, 'writer.lease.json');
const LEDGER = join(STATE_DIR, 'ledger.jsonl');
const RENDER_RETRIES = 3;
const RENDER_RETRY_WAIT_MS = 4_000;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const now = () => new Date().toISOString();
const sha = v => createHash('sha256').update(v).digest('hex');

export function loadBrief(name, path = join(HERE, 'briefs.json')) {
  const cfg = JSON.parse(readFileSync(path, 'utf8'));
  const hit = cfg.briefs.find(b => new RegExp(b.match, 'i').test(name)) ?? {};
  return { ...cfg.defaults, surface: stripReady(name), ...hit };
}

function ledger(event) {
  mkdirSync(STATE_DIR, { recursive: true });
  appendFileSync(LEDGER, `${JSON.stringify({ at: now(), ...event })}\n`);
}

/**
 * Exports and guards one frame. Cold exports race font and image loading;
 * re-export after a wait until the guard is clean, else fail the render.
 */
export async function renderTrusted(
  id,
  dir,
  facts,
  {
    exporter = exportFramesHeadless,
    wait = sleep,
    htmlFallback = renderViaHtml,
    requireStable = exporter !== exportFramesHeadless,
  } = {}
) {
  // Root fix for the font race: Pen's first export after a load can draw before
  // web fonts (Material Symbols, Inter) arrive. An export is trusted only when
  // two consecutive exports are byte-identical AND the guard is clean, so a
  // half-loaded font can never be the render a judge sees.
  let last;
  let prevMd5 = null;
  const scales = [1, 1, 1, 0.5];
  for (let attempt = 0; attempt < RENDER_RETRIES + 1; attempt++) {
    const [r] = exporter([id], dir, { scale: scales[attempt] ?? 1 });
    const img = decodePng(r.buf);
    const bad = renderGuard(
      [{ id, md5: r.md5, img }],
      { [id]: facts },
      { dark: !/light/i.test(facts.name) }
    );
    last = {
      ...r,
      attempt,
      guard: bad,
      renderer:
        exporter === exportFramesHeadless ? 'pen-headless' : 'pen-raster',
      stable: !requireStable || prevMd5 === r.md5,
    };
    if (bad.length === 0 && last.stable) return last;
    prevMd5 = bad.length === 0 ? r.md5 : null;
    if (bad.length) await wait(RENDER_RETRY_WAIT_MS * (attempt + 1));
  }
  if (last.guard.length === 0)
    return {
      ...last,
      stable: false,
      guard: [
        'render did not stabilise across exports (fonts or images still loading)',
      ],
    };
  // Raster still untrusted (garbled readback): Chromium render of the html-css export.
  const html = await htmlFallback(id, dir);
  if (!html?.buf)
    return { ...last, guard: [...last.guard, ...(html?.problems ?? [])] };
  const img = decodePng(html.buf);
  const bad = [
    ...html.problems,
    ...renderGuard(
      [{ id, md5: html.md5, img }],
      {},
      { dark: !/light/i.test(facts.name) }
    ).map(b => b.reason),
  ];
  return {
    ...html,
    attempt: last.attempt + 1,
    guard: bad,
    renderer: 'chromium-html',
    rasterGuard: last.guard,
  };
}

async function renderViaHtml(id, dir) {
  try {
    const htmlPath = join(dir, `${id}.html`);
    runPen([
      `Export(${JSON.stringify([id])},"html-css",${JSON.stringify(htmlPath)})`,
    ]);
    const outPath = join(dir, `${id}.chromium.png`);
    const [res] = await renderHtmlFiles([{ htmlPath, outPath }], {
      assetBase: dirname(CANONICAL_PEN),
    });
    const buf = readFileSync(outPath);
    return {
      id,
      path: outPath,
      buf,
      md5: createHash('md5').update(buf).digest('hex'),
      problems: res.problems,
    };
  } catch (error) {
    return {
      id,
      path: null,
      buf: null,
      md5: null,
      problems: [
        `html fallback failed: ${String(error.message).slice(0, 160)}`,
      ],
    };
  }
}

const CHECK_CTX = {
  lintCopy,
  deadEndRules: DEAD_END_RULES,
  deadEndTransient: DEAD_END_TRANSIENT,
  claimPatterns: CLAIM_PATTERNS,
};

export function fixPrompt(frame, issue, brief) {
  return [
    `You are the Pen fixer in Jovie's PROPOSAL review loop. Fix exactly one issue in one frame of the live Pen canvas "${CANONICAL_PEN}" using the pencil MCP execute tool.`,
    `Frame: ${frame.id} "${frame.name}". Mission of the screen: ${brief.mission}. Audience: ${brief.audience}.`,
    `Top issue (${issue.source}/${issue.check}): ${issue.message}${issue.fix ? `\nSuggested fix: ${issue.fix}` : ''}${issue.element ? `\nElement: ${issue.element}` : ''}`,
    issue.nodes?.length
      ? `Nodes: ${issue.nodes.join(', ')}\nDetail: ${JSON.stringify(issue.detail ?? []).slice(0, 2500)}`
      : '',
    'Rules: edit only nodes inside this frame (never a reusable component master, never another frame, never variables). Use the existing $tokens for colour, type size and radius; spacing on the 4px grid; whole-pixel geometry; one content axis; one filled primary action per screen; sentence-case, plain copy with no em dashes. Keep the design language; do not redesign the screen.',
    'Read the frame first (Get with depth or a visitor), make the smallest change that fixes the issue everywhere it applies, then TakeScreenshot the frame and confirm. Do not save, do not open or switch documents. Reply with one line saying what you changed.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function runFixerAgent(prompt, { timeoutMs = 12 * 60_000 } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'pen-fixer-'));
  const res = spawnSync(
    'claude',
    [
      '-p',
      prompt,
      '--model',
      process.env.PEN_REVIEW_FIXER_MODEL || 'sonnet',
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
  { receiptsDir, fixer = 'agent', maxRounds = DEFAULT_MAX_ROUNDS, holder }
) {
  const dir = join(receiptsDir, id);
  mkdirSync(dir, { recursive: true });
  const [tree] = frameTrees([id]);
  if (!tree || tree.missing) throw new Error(`frame ${id} not found`);
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
  let quietRounds = 0;
  for (let round = 0; round < maxRounds; round++) {
    const r = { round, startedAt: now() };
    const facts = readFacts(id);
    const render = await renderTrusted(id, join(dir, `r${round}`), facts);
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
      receipt.rounds.push({ ...r, finishedAt: now() });
      receipt.verdict = 'render-untrusted';
      break;
    }
    const findings = [
      ...runChecks(facts, {
        ...CHECK_CTX,
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
    const panel = await runPanel({
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
    const decision = panel.complete
      ? decideRound({
          checks: findings,
          gates: gate,
          judges: panel.judges,
          quietRounds,
          round,
          maxRounds,
        })
      : {
          action: round + 1 >= maxRounds ? 'fail' : 'rejudge',
          quietRounds: 0,
          topIssue: null,
          incomplete: true,
        };
    quietRounds = decision.quietRounds;
    r.decision = decision;
    if (decision.action === 'fix') {
      if (fixer !== 'agent') {
        receipt.rounds.push({ ...r, finishedAt: now() });
        receipt.verdict = 'needs-fix';
        receipt.nextFix = decision.topIssue;
        break;
      }
      r.fix = runFixerAgent(
        fixPrompt({ id, name: tree.name }, decision.topIssue, brief)
      );
    }
    receipt.rounds.push({ ...r, finishedAt: now() });
    ledger({
      stage: 'pen-review-round',
      frame: id,
      round,
      action: decision.action,
      startedAt: r.startedAt,
      finishedAt: now(),
    });
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
  const [after] = frameTrees([id]);
  receipt.digestAfter = frameDigest(after);
  const body = JSON.stringify(receipt, null, 2);
  receipt.receiptHash = sha(body);
  if (receipt.verdict === 'pass') {
    renameFrame(id, markReady(after.name, receipt.receiptHash));
    receipt.readyMarked = true;
  } else if (after.name !== stripReady(after.name)) {
    renameFrame(id, stripReady(after.name)); // a stale marker never survives a failed review
  }
  writeFileSync(
    join(dir, 'receipt.json'),
    `${JSON.stringify(receipt, null, 2)}\n`
  );
  ledger({
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
    targets: trees
      .filter(t => state[t.id]?.digest !== frameDigest(t))
      .map(t => t.id),
    trees,
  };
}

function arg(argv, name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
}

async function main(argv) {
  const [cmd, sub] = argv;
  const holder = arg(
    argv,
    'holder',
    process.env.PEN_REVIEW_HOLDER || 'pen-review-loop'
  );
  if (existsSync(join(STATE_DIR, 'disabled')) && cmd !== 'lease') {
    console.log('pen-review disabled (kill switch)');
    return 0;
  }
  if (cmd === 'lease') {
    if (sub === 'acquire')
      return report(
        acquireLease(LEASE_PATH, {
          holder,
          scope: arg(argv, 'scope', 'proposal-frames'),
        }),
        r => (r.ok ? 0 : 3)
      );
    if (sub === 'release')
      return report({ released: releaseLease(LEASE_PATH, holder) }, () => 0);
    return report(readLease(LEASE_PATH), () => 0);
  }
  if (cmd === 'save') {
    const lease = readLease(LEASE_PATH);
    if (
      !lease ||
      lease.holder !== holder ||
      Date.parse(lease.expiresAt) < Date.now()
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
  const lease = acquireLease(LEASE_PATH, {
    holder,
    scope: 'proposal-frames',
    ttlMs: 60 * 60_000,
  });
  if (!lease.ok)
    return report(
      { skipped: true, reason: 'writer lease held', heldBy: lease.heldBy },
      () => 3
    );
  const opts = {
    receiptsDir,
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
    let rec;
    try {
      rec = await reviewFrame(id, opts);
    } catch (error) {
      // One frame's infrastructure failure never stops the batch.
      ledger({
        stage: 'pen-review-frame',
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
      continue;
    }
    results.push({
      id,
      name: rec.frame.name,
      verdict: rec.verdict,
      rounds: rec.rounds.length,
      nextFix: rec.nextFix?.message,
    });
    if (sweep) {
      sweep.state[id] = {
        digest: rec.digestAfter,
        verdict: rec.verdict,
        at: now(),
      };
      writeFileSync(
        sweep.statePath,
        `${JSON.stringify(sweep.state, null, 2)}\n`
      );
    }
  }
  return report({ results }, r =>
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
