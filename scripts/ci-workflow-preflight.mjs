#!/usr/bin/env node
/**
 * One local command for every workflow-related contract a PR trips one CI
 * round trip at a time (#23200 needed three 30-40 min trips: cron freeze,
 * regenerated topology, ownership, automation registry, stage manifest).
 *
 *   pnpm ci:workflow:preflight [--base origin/main] [--title T] [--body-file F] [--json]
 *
 * Runs every check that applies to the changed files, never stops at the first
 * failure, and prints one checklist with the fix for each red item.
 * Exit 0 = nothing to fix (or no workflow-related change); 1 = fix the list.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { selectSourceGuards } from './ci-fast-lanes.mjs';
import { evaluateFleetRules } from './pr-fleet-rules.mjs';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

/** Paths whose change can trip a workflow-level contract. */
export const WORKFLOW_RELATED =
  /^(?:\.github\/workflows\/[^/]+\.ya?ml|\.github\/actions\/|\.github\/workflow-topology\.gen\.yml|canon\/(?:ownership\.json|automation-registry\.jsonl)|docs\/metrics\/stage-manifest\.json|scripts\/(?:ci-workflow-(?:topology|preflight)|ownership-registry|stage-manifest-check|verify-workflow-references|workflow-[^/]+)\.m?js|scripts\/lib\/(?:ci-schedule-inventory|automation-registry|workflow-[^/]+)\.mjs)$/u;

const SOURCE_GUARD_IDS = new Set([
  'ci-schedule-inventory',
  'automation-registry',
  'synthetic-canary-liveness',
]);

export function isWorkflowRelated(changed) {
  return changed.some(file => WORKFLOW_RELATED.test(file));
}

/** Workflow files this change adds or edits (basename without extension). */
export function changedWorkflowNames(changed) {
  return changed
    .map(file => /^\.github\/workflows\/([^/]+)\.ya?ml$/u.exec(file)?.[1])
    .filter(Boolean);
}

/**
 * The checklist. `cmd` is argv; `when` decides if it applies.
 * Each `fix` is what an agent does on red, in one line.
 */
export function buildChecks(changed) {
  const touched = changedWorkflowNames(changed);
  const addsTest = changed.some(file => /^scripts\/.*\.test\.mjs$/u.test(file));
  const node = (...args) => ['node', ...args];
  const checks = [
    {
      id: 'topology',
      label:
        'CI workflow topology (.github/workflow-topology.gen.yml is current)',
      cmd: node('scripts/ci-workflow-topology.mjs'),
      fix: 'pnpm ci:topology:write, then commit .github/workflow-topology.gen.yml. A new workflow_run edge may also need an allowed consumer.',
    },
    {
      id: 'ownership',
      label:
        'Ownership registry (every workflow has an owner in canon/ownership.json)',
      cmd: node('scripts/ownership-registry.mjs', '--report'),
      fix: 'Add {"id":"workflow:<name>","kind":"workflow","owner":"<agent role>","status":"active","ref":".github/workflows/<name>.yml"} to canon/ownership.json.',
    },
    {
      id: 'stage-manifest',
      label: 'Stage manifest (delivery workflows are registered or exempted)',
      cmd: node('scripts/stage-manifest-check.mjs'),
      fix: 'Register the workflow as a stage producer in docs/metrics/stage-manifest.json, or exempt it with a reason (docs/metrics/STAGE_EVENTS.md).',
    },
    {
      id: 'workflow-references',
      label: 'Workflow references resolve (actions, reusable workflows, paths)',
      cmd: node('scripts/verify-workflow-references.mjs'),
      fix: 'Fix the reference named in the output; pin actions by full SHA.',
    },
    {
      id: 'expression-budget',
      label: 'Interpolated run scripts fit the GitHub expression limit',
      cmd: node('scripts/workflow-expression-budget.mjs', '--ref', 'HEAD'),
      fix: 'Move long ${{ }} interpolation into env: and read it in the script.',
    },
    {
      id: 'token-scope',
      label: 'GITHUB_TOKEN permission scope matches the API calls',
      cmd: node('scripts/workflow-token-scope.mjs'),
      fix: 'Add the missing permissions: entry (least privilege) or acknowledge the call per the output.',
    },
    {
      id: 'token-budget',
      label: 'GITHUB_TOKEN budget (no new unbudgeted spend)',
      cmd: node('scripts/workflow-token-budget-guard.mjs'),
      fix: 'Declare a budget or use the primed toolcache / App token path; grandfathered sites only shrink (scripts/lib/workflow-token-budget.ratchet.json).',
    },
  ];
  // ci-fast source guards that read workflows: the cron freeze (JOV-INV-042)
  // and the automation registry. Selected exactly as CI selects them.
  for (const guard of selectSourceGuards('pull_request', changed)) {
    if (!SOURCE_GUARD_IDS.has(guard.id)) continue;
    checks.push({
      id: guard.id,
      label:
        guard.id === 'ci-schedule-inventory'
          ? 'Cron freeze JOV-INV-042 (no new cron; kept clocks name their reason)'
          : guard.id === 'automation-registry'
            ? 'Automation registry (every cron/clock has a live canon/automation-registry.jsonl entry)'
            : 'Synthetic canary liveness',
      cmd: ['bash', '-lc', guard.command],
      fix:
        guard.id === 'ci-schedule-inventory'
          ? 'Do not add a cron: use an event trigger. If a clock is truly required, declare # clock-class: and a CRON_KEEP_REASONS entry in scripts/lib/ci-schedule-inventory.mjs (the list only shrinks, so this needs an explicit decision).'
          : 'Add or update the automation line in canon/automation-registry.jsonl (owner, trigger, metric, receipt, max staleness, kill switch).',
    });
  }
  if (addsTest) {
    checks.push({
      id: 'wired-tests',
      label: 'New script tests are wired into a ci-fast lane',
      cmd: node(
        '--test',
        'scripts/lib/__tests__/script-contract-affected.test.mjs'
      ),
      fix: 'Add the file to SCRIPT_CONTRACT_NODE_TESTS (or _VITEST_TESTS) in scripts/ci-fast-lanes.mjs.',
    });
  }
  return { checks, touched };
}

/** Check that the PR body satisfies the Fleet Rules sections. */
export function bodyFindings({ title, body, files }) {
  const { errors, warnings } = evaluateFleetRules({
    pr: { title, body, labels: [] },
    files: files.map(filename => ({ filename, status: 'modified', patch: '' })),
  });
  return { errors, warnings };
}

export function formatChecklist(results, { changedCount, touched }) {
  const lines = [
    `workflow preflight: ${changedCount} changed file(s); workflows touched: ${touched.length ? touched.join(', ') : 'none'}`,
    '',
  ];
  for (const r of results) {
    lines.push(`${r.ok ? '[x]' : '[ ]'} ${r.label}`);
    if (!r.ok) {
      lines.push(`      fix: ${r.fix}`);
      for (const out of r.excerpt) lines.push(`      > ${out}`);
    }
  }
  const failed = results.filter(r => !r.ok).length;
  lines.push('');
  lines.push(
    failed === 0
      ? 'preflight clean: nothing to fix before pushing.'
      : `${failed} item(s) to fix before pushing. Re-run: pnpm ci:workflow:preflight`
  );
  return lines.join('\n');
}

function git(args, cwd = REPO_ROOT) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return r.status === 0 ? r.stdout : '';
}

export function listChangedFiles(base = 'origin/main', cwd = REPO_ROOT) {
  const mergeBase = git(['merge-base', 'HEAD', base], cwd).trim() || base;
  const names = new Set(
    [
      ...git(['diff', '--name-only', mergeBase], cwd).split('\n'),
      ...git(['ls-files', '--others', '--exclude-standard'], cwd).split('\n'),
    ].filter(Boolean)
  );
  return [...names].sort();
}

const FAILURE_LINE =
  /(?:::error|✗|✖|×|\bfail|\berror\b|stale|no owner|not registered|missing|unwired|expected)/iu;

/** The lines that explain a red check, not its whole log. */
export function failureLines(output) {
  const hits = output.filter(line => FAILURE_LINE.test(line));
  return (hits.length ? hits : output.slice(-8)).slice(0, 8);
}

export function runCheck(check, cwd = REPO_ROOT) {
  const [cmd, ...args] = check.cmd;
  const r = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  const output = `${r.stdout ?? ''}${r.stderr ?? ''}`
    // biome-ignore lint/suspicious/noControlCharactersInRegex: strip ANSI colour.
    .replace(/\u001b\[[0-9;]*m/gu, '')
    .split('\n')
    .map(line => line.trimEnd())
    .filter(line => line && !/^(\s*at |Node\.js)/u.test(line));
  const ok = r.status === 0;
  return {
    id: check.id,
    label: check.label,
    fix: check.fix,
    ok,
    excerpt: ok ? [] : failureLines(output),
  };
}

/**
 * One line per run so the effect is measured (CI round trips per
 * workflow-adding PR): which checks were red locally, how long it took.
 * Best effort; JOVIE_PREFLIGHT_LEDGER=off disables it.
 */
export function recordRun(results, { changed, durationMs }, env = process.env) {
  const target =
    env.JOVIE_PREFLIGHT_LEDGER ??
    resolve(homedir(), '.local/state/jovie-lanes/workflow-preflight.jsonl');
  if (target === 'off') return;
  try {
    mkdirSync(dirname(target), { recursive: true });
    appendFileSync(
      target,
      `${JSON.stringify({
        at: new Date().toISOString(),
        branch: git(['branch', '--show-current']).trim(),
        head: git(['rev-parse', 'HEAD']).trim(),
        changed: changed.length,
        durationMs,
        red: results.filter(r => !r.ok).map(r => r.id),
        ok: results.every(r => r.ok),
      })}\n`
    );
  } catch {
    // Measurement must never block a push.
  }
}

export function main(argv = process.argv.slice(2)) {
  const opt = name => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const changed = listChangedFiles(opt('--base') ?? 'origin/main');
  if (!isWorkflowRelated(changed)) {
    console.log(
      'workflow preflight: no workflow-related file changed; nothing to check.'
    );
    return 0;
  }
  const started = Date.now();
  const { checks, touched } = buildChecks(changed);
  const results = checks.map(check => runCheck(check));
  const bodyFile = opt('--body-file');
  if (bodyFile) {
    const title = opt('--title') ?? '';
    const found = existsSync(bodyFile)
      ? bodyFindings({
          title,
          body: readFileSync(bodyFile, 'utf8'),
          files: changed,
        })
      : { errors: [`body file not found: ${bodyFile}`], warnings: [] };
    results.push({
      id: 'pr-body',
      label:
        'PR body satisfies Fleet Rules (Red-before-green, Blast radius, receipts)',
      fix: 'Fill the PR template sections named below.',
      ok: found.errors.length === 0 && found.warnings.length === 0,
      excerpt: [...found.errors, ...found.warnings],
    });
  }
  recordRun(results, { changed, durationMs: Date.now() - started });
  if (argv.includes('--json')) console.log(JSON.stringify(results, null, 2));
  else
    console.log(
      formatChecklist(results, { changedCount: changed.length, touched })
    );
  return results.every(r => r.ok) ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = main();
