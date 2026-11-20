#!/usr/bin/env node
/**
 * Summer PR no-stall classifier (JOV-INV-017 companion).
 *
 * Detects open PRs that cannot converge because the Cursor/Gem owner went idle
 * while admission is blocked by a machine `lane-fix-red` hold, or a draft-green
 * head never left draft. Summer owns reclaim; Cursor Projects are not the
 * watchdog (see docs/operations/SUMMER_NO_STALL.md).
 *
 * Pure classification is default. `--apply` empty-bumps a bounded set of
 * admission-deadlock heads so queue-breaker can release and green-enroll can
 * reconsider (designed reclaim: new head). Never pushes main.
 */

import { spawnSync } from 'node:child_process';

export const SCHEMA = 'jovie-summer-pr-no-stall/v1';
export const DEFAULT_IDLE_HOURS = 6;
export const DEFAULT_APPLY_LIMIT = 5;

/** Agent-authored branch prefixes that the old harness omitted (`cursor/` gap). */
export const AGENT_BRANCH_RE =
  /^(cursor|codex|claude|linear|codegen-bot|glm|ha|evr|flash|hyperagent|grok|chloe|lola)\//i;

export const STOP_LABELS = new Set([
  'hold',
  'gated',
  'incident',
  'needs-outside-review',
  'big-pr',
  'queue-poison',
  'queue-deferred',
]);

/**
 * @param {unknown} labels
 * @returns {string[]}
 */
export function labelNames(labels) {
  if (!Array.isArray(labels)) return [];
  return labels
    .map(label =>
      String(typeof label === 'string' ? label : (label?.name ?? ''))
        .trim()
        .toLowerCase()
    )
    .filter(Boolean);
}

/**
 * @param {string | null | undefined} updatedAt
 * @param {number} nowMs
 */
export function ageHours(updatedAt, nowMs = Date.now()) {
  if (!updatedAt) return null;
  const ms = Date.parse(String(updatedAt));
  if (!Number.isFinite(ms)) return null;
  return (nowMs - ms) / 3_600_000;
}

/**
 * @param {{
 *   number?: number,
 *   title?: string,
 *   isDraft?: boolean,
 *   mergeable?: string | null,
 *   mergeStateStatus?: string | null,
 *   headRefName?: string,
 *   updatedAt?: string,
 *   url?: string,
 *   labels?: unknown,
 *   autoMergeRequest?: unknown,
 * }} pr
 * @param {{ nowMs?: number, idleHours?: number }} [opts]
 */
export function classifyOpenPr(pr, opts = {}) {
  const idleHours = opts.idleHours ?? DEFAULT_IDLE_HOURS;
  const nowMs = opts.nowMs ?? Date.now();
  const labels = labelNames(pr.labels);
  const labelSet = new Set(labels);
  const branch = String(pr.headRefName ?? '');
  const age = ageHours(pr.updatedAt, nowMs);
  const base = {
    number: pr.number ?? null,
    title: pr.title ?? '',
    branch,
    url: pr.url ?? null,
    isDraft: pr.isDraft === true,
    mergeable: pr.mergeable ?? null,
    mergeStateStatus: pr.mergeStateStatus ?? null,
    labels,
    ageHours: age,
    agentBranch: AGENT_BRANCH_RE.test(branch) || /(^|\/)jov-\d+/i.test(branch),
  };

  if (labels.some(name => STOP_LABELS.has(name))) {
    return {
      ...base,
      class: 'tim-or-hold',
      action: 'leave-for-tim',
      reason: 'stop-or-taste-label',
    };
  }

  const mergeableOk =
    String(pr.mergeable ?? '').toUpperCase() === 'MERGEABLE' ||
    ['CLEAN', 'HAS_HOOKS', 'UNSTABLE', 'BLOCKED'].includes(
      String(pr.mergeStateStatus ?? '').toUpperCase()
    );
  const idle = age != null && age >= idleHours;
  const red = labelSet.has('lane-fix-red');
  const draftGreen =
    pr.isDraft === true &&
    (labelSet.has('lane-fix-green') || labelSet.has('lane-fix-stale'));

  if (!pr.isDraft && red && mergeableOk && idle) {
    return {
      ...base,
      class: 'admission-deadlock',
      action: 'empty-head-bump',
      reason:
        'ready+lane-fix-red+idle: enroll blocked until new head releases breaker hold',
    };
  }

  if (draftGreen && idle) {
    return {
      ...base,
      class: 'draft-green-stale',
      action: 'auto-ready',
      reason: 'draft carries lane-fix-green/stale and owner went idle',
    };
  }

  if (
    !pr.isDraft &&
    mergeableOk &&
    idle &&
    !red &&
    !pr.autoMergeRequest &&
    base.agentBranch
  ) {
    return {
      ...base,
      class: 'ready-unenrolled',
      action: 'wake-green-enroll',
      reason: 'ready agent PR idle without auto-merge / queue progress',
    };
  }

  if (labelSet.has('lane-fix-conflict') && idle) {
    return {
      ...base,
      class: 'conflict-idle',
      action: 'restack-or-lane-fix',
      reason: 'conflict label with idle owner',
    };
  }

  return {
    ...base,
    class: 'ok-or-active',
    action: 'none',
    reason: idle ? 'idle-but-no-deadlock-pattern' : 'fresh-or-in-flight',
  };
}

/**
 * @param {unknown[]} prs
 * @param {{ nowMs?: number, idleHours?: number }} [opts]
 */
export function inventoryOpenPrs(prs, opts = {}) {
  const rows = (Array.isArray(prs) ? prs : []).map(pr =>
    classifyOpenPr(/** @type {any} */ (pr), opts)
  );
  const byClass = Object.create(null);
  for (const row of rows) {
    byClass[row.class] = (byClass[row.class] ?? 0) + 1;
  }
  const actionable = rows.filter(
    row =>
      row.class === 'admission-deadlock' ||
      row.class === 'draft-green-stale' ||
      row.class === 'ready-unenrolled'
  );
  return {
    schema: SCHEMA,
    observedAt: new Date(opts.nowMs ?? Date.now()).toISOString(),
    openCount: rows.length,
    byClass,
    actionable,
    rows,
  };
}

/**
 * @param {string[]} args
 */
export function parseArgs(args) {
  const out = {
    apply: false,
    limit: DEFAULT_APPLY_LIMIT,
    idleHours: DEFAULT_IDLE_HOURS,
    json: false,
    help: false,
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--apply') out.apply = true;
    else if (arg === '--json') out.json = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg.startsWith('--limit='))
      out.limit = Math.max(0, Number(arg.slice('--limit='.length)) || 0);
    else if (arg === '--limit') out.limit = Math.max(0, Number(args[++i]) || 0);
    else if (arg.startsWith('--idle-hours='))
      out.idleHours = Math.max(
        1,
        Number(arg.slice('--idle-hours='.length)) || DEFAULT_IDLE_HOURS
      );
    else if (arg === '--idle-hours')
      out.idleHours = Math.max(1, Number(args[++i]) || DEFAULT_IDLE_HOURS);
  }
  return out;
}

function ghJson(args, run = spawnSync) {
  const done = run('gh', args, {
    encoding: 'utf8',
    env: process.env,
  });
  if (done.status !== 0) {
    throw new Error(
      `gh ${args.join(' ')} failed: ${(done.stderr || done.stdout || '').slice(0, 400)}`
    );
  }
  return JSON.parse(done.stdout || '[]');
}

/**
 * Empty-bump a branch tip (new head). Never touches main.
 * @param {{ number: number, branch: string }} target
 * @param {{ run?: typeof spawnSync, repo?: string }} [deps]
 */
export function emptyHeadBump(target, deps = {}) {
  const run = deps.run ?? spawnSync;
  const repo = deps.repo ?? process.env.GITHUB_REPOSITORY ?? 'JovieInc/Jovie';
  const branch = target.branch;
  if (!branch || branch === 'main' || branch.startsWith('gh-readonly-queue/')) {
    return { ok: false, reason: 'refused-protected-ref', branch };
  }
  const work = run(
    'bash',
    [
      '-lc',
      [
        'set -euo pipefail',
        `git fetch origin ${JSON.stringify(branch)}`,
        `git checkout -B "tmp-summer-no-stall-${target.number}" "origin/${branch}"`,
        `git commit --allow-empty -m ${JSON.stringify(
          `chore(ci): Summer no-stall head bump (#${target.number})\n\nReclaim admission-deadlock: new head so queue-breaker can release lane-fix-red and green-enroll can reconsider.`
        )}`,
        `git push origin "HEAD:refs/heads/${branch}"`,
      ].join('\n'),
    ],
    { encoding: 'utf8', env: process.env }
  );
  if (work.status !== 0) {
    return {
      ok: false,
      reason: (work.stderr || work.stdout || 'push-failed').slice(0, 400),
      branch,
      number: target.number,
    };
  }
  return { ok: true, number: target.number, branch, repo };
}

/**
 * @param {string[]} argv
 * @param {{ run?: typeof spawnSync, listPrs?: () => unknown[], nowMs?: number }} [deps]
 */
export function main(argv = process.argv.slice(2), deps = {}) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(
      'usage: node scripts/summer/pr-no-stall.mjs [--json] [--apply] [--limit N] [--idle-hours N]\n'
    );
    return 0;
  }
  const listPrs =
    deps.listPrs ??
    (() =>
      ghJson(
        [
          'pr',
          'list',
          '--state',
          'open',
          '--limit',
          '100',
          '--json',
          'number,title,isDraft,author,headRefName,updatedAt,url,labels,mergeable,mergeStateStatus,autoMergeRequest',
        ],
        deps.run
      ));
  const inventory = inventoryOpenPrs(listPrs(), {
    nowMs: deps.nowMs,
    idleHours: args.idleHours,
  });

  const applied = [];
  if (args.apply) {
    const deadlocks = inventory.actionable
      .filter(row => row.class === 'admission-deadlock' && row.branch)
      .slice(0, args.limit);
    for (const row of deadlocks) {
      applied.push(
        emptyHeadBump(
          { number: /** @type {number} */ (row.number), branch: row.branch },
          { run: deps.run }
        )
      );
    }
  }

  const report = { ...inventory, applied };
  if (args.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(
      `summer-pr-no-stall open=${report.openCount} actionable=${report.actionable.length} byClass=${JSON.stringify(report.byClass)}\n`
    );
    for (const row of report.actionable) {
      process.stdout.write(
        `  #${row.number} ${row.class} → ${row.action} (${row.reason}) ${row.branch}\n`
      );
    }
    for (const row of applied) {
      process.stdout.write(
        `  apply #${row.number ?? '?'} ok=${row.ok} ${row.reason ?? row.branch}\n`
      );
    }
  }
  return report.actionable.some(row => row.class === 'admission-deadlock') &&
    !args.apply
    ? 75
    : 0;
}

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('/pr-no-stall.mjs') ||
    process.argv[1].endsWith('\\pr-no-stall.mjs'));
if (isDirectRun) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
