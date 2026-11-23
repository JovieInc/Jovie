#!/usr/bin/env node
/**
 * Decide which Golden Path steps the served release re-certifies (JOV-14402).
 *
 *   node scripts/golden-path-cert-reuse.mjs decide --served-sha SHA
 *     --ledger ledger.json [--force true] [--plan-out FILE]
 *     [--github-output FILE]
 *
 * --ledger is the body of GET /api/internal/ovie/golden-path-evidence. For
 * each step with a pass on an earlier release, the step's scope is diffed
 * from the SHA that actually exercised it to the served SHA (both trees, so
 * deletes and renames count), and the certification producer is diffed from
 * that SHA to this checkout. Untouched steps carry forward; touched ones
 * re-certify; steps that already passed on the served SHA need nothing.
 *
 * It fails toward certifying: an unreadable ledger, a missing commit or any
 * error re-certifies every step. It always exits 0 so a decision problem
 * never fails the resolver job (that would page).
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import {
  allCurrent,
  decideCarry,
  readLedgerCertifications,
} from './lib/golden-path-cert-reuse.mjs';
import {
  changedPathsBetween,
  loadStepScopeConfig,
  producerScope,
  touchedSteps,
  withTree,
} from './lib/golden-path-step-scope.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** @param {string | undefined} path */
function readLedgerFile(path) {
  if (!path) return null;
  try {
    return readLedgerCertifications(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    return null;
  }
}

/** @param {string} root */
function headSha(root) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error('git rev-parse failed');
  return result.stdout.trim();
}

/**
 * Which steps changed between `fromSha` (the step's exercised release) and
 * the served release, or since then in the certification producer.
 * @param {{ root: string, servedSha: string, head: string }} input
 * @returns {(fromSha: string) => import('./lib/golden-path-cert-reuse.mjs').Touched}
 */
export function gitTouched({ root, servedSha, head }) {
  const producer = new Set(
    producerScope(root, { config: loadStepScopeConfig(root) })
  );
  return fromSha => {
    const changedProducer = changedPathsBetween(root, fromSha, head).find(
      path => producer.has(path)
    );
    if (changedProducer)
      return {
        all: true,
        steps: [],
        reason: `certification code changed since ${fromSha.slice(0, 8)} (${changedProducer})`,
      };
    const changed = changedPathsBetween(root, fromSha, servedSha);
    return withTree(root, fromSha, oldTree =>
      withTree(root, servedSha, newTree =>
        touchedSteps(changed, [oldTree, newTree], { configRoot: root })
      )
    );
  };
}

/**
 * @param {import('./lib/golden-path-cert-reuse.mjs').CarryPlan} plan
 * @returns {string[]}
 */
export function planLines(plan) {
  const short = plan.servedSha.slice(0, 8);
  if (allCurrent(plan))
    return [
      `Golden Path: every step is already certified on ${short}; nothing to run.`,
    ];
  return [
    `Golden Path on ${short}: ${plan.recertify.length} to certify, ${plan.carried.length} carried, ${plan.current.length} already certified.`,
    ...plan.recertify.map(r => `- certify ${r.surface}: ${r.why}`),
    ...plan.carried.map(
      c =>
        `- carry ${c.surface} from ${c.from.sha.slice(0, 8)} (${c.from.runUrl ?? 'run unknown'})`
    ),
    ...plan.current.map(id => `- ${id} already certified on ${short}`),
  ];
}

/** @param {string[]} [argv] @param {NodeJS.ProcessEnv} [env] */
export function main(argv = process.argv.slice(2), env = process.env) {
  const [command, ...rest] = argv;
  if (command !== 'decide') {
    process.stderr.write('usage: golden-path-cert-reuse.mjs decide ...\n');
    return 64;
  }
  const { values } = parseArgs({
    args: rest,
    options: {
      'served-sha': { type: 'string' },
      ledger: { type: 'string' },
      force: { type: 'string', default: 'false' },
      'plan-out': { type: 'string' },
      'github-output': { type: 'string' },
    },
  });
  const servedSha = String(values['served-sha'] ?? '');
  let plan;
  try {
    plan = decideCarry({
      servedSha,
      ledger: readLedgerFile(values.ledger),
      force: values.force === 'true',
      touched: gitTouched({ root: ROOT, servedSha, head: headSha(ROOT) }),
    });
  } catch (error) {
    console.log(
      `::warning::Carry decision failed (${error instanceof Error ? error.message : 'unknown'}); certifying every step.`
    );
    plan = decideCarry({
      servedSha,
      ledger: null,
      touched: () => ({ all: true, steps: [] }),
    });
  }
  const lines = planLines(plan);
  for (const line of lines) console.log(line);
  if (env.GITHUB_STEP_SUMMARY)
    appendFileSync(env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
  const json = JSON.stringify(plan);
  if (values['plan-out']) writeFileSync(values['plan-out'], `${json}\n`);
  if (values['github-output'])
    appendFileSync(
      values['github-output'],
      `${[
        `all_current=${allCurrent(plan)}`,
        `recertify=${plan.recertify.map(r => r.surface).join(' ')}`,
        `carried=${plan.carried.map(c => c.surface).join(' ')}`,
        `plan_b64=${Buffer.from(json).toString('base64')}`,
      ].join('\n')}\n`
    );
  return 0;
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 2;
  }
}
