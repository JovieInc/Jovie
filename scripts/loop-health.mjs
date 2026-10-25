#!/usr/bin/env node
/**
 * Run one closed loop: collect -> evaluate -> receipt -> Linear intake.
 *
 *   node scripts/loop-health.mjs --loop email-deliverability [--receipt out.json] [--no-file]
 *
 * Exit 0 when the loop ran (a breach is the loop working, the issue is the
 * output). Exit 1 when it could not collect: a loop that cannot see must fail
 * its workflow so the dead-man registry row goes red instead of reading green.
 */
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  closeLinearIssueByFingerprint,
  logRemediationDryRun,
  remediationTriggersEnabled,
  upsertLinearIssueByTitleFingerprint,
} from './lib/linear-issue-intake.mjs';
import {
  buildIssue,
  buildReceipt,
  evaluateRules,
  planLoopIntake,
  resolveComment,
} from './lib/loop-health.mjs';

export async function loadLoop(loop) {
  if (!/^[a-z0-9-]+$/.test(loop)) throw new Error('invalid_loop_name');
  const mod = await import(new URL(`./loops/${loop}.mjs`, import.meta.url));
  return mod.default;
}

export async function runLoop(
  def,
  {
    env = process.env,
    now = () => new Date(),
    fetchImpl = fetch,
    file = true,
    upsertImpl = upsertLinearIssueByTitleFingerprint,
    closeImpl = closeLinearIssueByFingerprint,
  } = {}
) {
  const startedAt = now().toISOString();
  let metrics = {};
  let detail = {};
  let collectError = null;
  try {
    const collected = await def.collect({ env, fetchImpl, now });
    metrics = collected.metrics ?? {};
    detail = collected.detail ?? {};
  } catch (error) {
    collectError = error instanceof Error ? error.message : String(error);
  }
  const evaluation = collectError
    ? { status: 'hold', results: [] }
    : evaluateRules(def.rules, metrics);
  const receipt = buildReceipt({
    loop: def.key,
    startedAt,
    finishedAt: now().toISOString(),
    metrics,
    evaluation,
    detail,
    collectError,
  });
  const plan = planLoopIntake(receipt);
  let intake = { ok: true, action: 'skipped' };
  if (file && plan.action !== 'hold') {
    if (!remediationTriggersEnabled(env)) {
      intake = logRemediationDryRun({
        action: plan.action,
        key: plan.key,
        fingerprint: plan.key,
      });
    } else if (plan.action === 'upsert') {
      const issue = buildIssue(def, receipt, env.RUN_URL ?? '');
      intake = await upsertImpl({
        ...issue,
        labelKey: plan.key,
        priority: def.priority ?? 2,
        createStateName: 'Todo',
        reopenTerminal: true,
        fetchImpl,
      });
    } else {
      intake = await closeImpl({
        fingerprint: plan.key,
        labelKey: plan.key,
        comment: resolveComment(def, receipt),
        runId: env.GITHUB_RUN_ID,
        fetchImpl,
      });
    }
  }
  return { receipt, plan, intake };
}

async function main() {
  const args = process.argv.slice(2);
  const get = name => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const loop = get('--loop');
  if (!loop) throw new Error('--loop is required');
  const def = await loadLoop(loop);
  const { receipt, plan, intake } = await runLoop(def, {
    file: !args.includes('--no-file'),
  });
  const out = get('--receipt');
  if (out) writeFileSync(out, JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ loop, status: receipt.status, plan, intake }));
  if (receipt.status === 'error') {
    console.error(`collect failed: ${receipt.collectError}`);
    process.exit(1);
  }
  if (intake && intake.ok === false) {
    console.error(`intake failed: ${intake.reason}`);
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
