#!/usr/bin/env node
// JOV-INV-029: owning writer records exact native intent before mutation.
// JOV-INV-023: source intent does not depend on fleet or production observations.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runSourceAdmission } from './lib/source-admission-policy.mjs';

// GitHub owns waiting and merge-group enforcement. This command never polls,
// updates branches, changes labels, retries admission, or uses admin privileges.
export const QUERY = `query($owner:String!,$name:String!,$number:Int!){
 viewer{login}
 repository(owner:$owner,name:$name){pullRequest(number:$number){
 headRefOid baseRefName state isDraft mergeable reviewDecision
 isMergeQueueEnabled isInMergeQueue mergeQueueEntry{position} autoMergeRequest{enabledAt}
 timelineItems(last:1,itemTypes:[REMOVED_FROM_MERGE_QUEUE_EVENT]){nodes{
 ... on RemovedFromMergeQueueEvent{id beforeCommit{oid} reason}
 }}
 }}}`;

export function execute(args) {
  try {
    return {
      code: 0,
      stdout: execFileSync('gh', args, {
        encoding: 'utf8',
        timeout: 30000,
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    };
  } catch (error) {
    return { code: error.status ?? 1, stdout: String(error.stdout ?? '') };
  }
}

export function parseArgs(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = {
      '--repo': 'repo',
      '--pr': 'pr',
      '--head': 'head',
      '--base': 'base',
      '--receipt-dir': 'receiptDir',
      '--reconcile-removal': 'reconcileRemoval',
      '--reconciliation-receipt': 'reconciliationReceipt',
    }[args[i]];
    if (!key || !args[i + 1] || options[key] !== undefined) {
      throw new Error(
        'Expected --repo OWNER/REPO --pr NUMBER --head 40SHA [--base main] [--receipt-dir PATH] [--reconcile-removal NODE_ID --reconciliation-receipt PATH]'
      );
    }
    options[key] = args[i + 1];
  }
  return options;
}

/**
 * @typedef {{code: number, stdout: string}} CommandResult
 * @typedef {{repo?: string, pr?: number | string, head?: string, receiptDir?: string, base?: string, reconcileRemoval?: string, reconciliationReceipt?: string}} MergeIntentOptions
 * @typedef {{status: string, reason: string, repo?: string, pr: number, head?: string, position?: number, receipt?: string, requestExitCode?: number, blockers?: string[], removalEventId?: string}} MergeIntentResult
 * @param {MergeIntentOptions} options
 * @param {{exec?: (args: string[]) => CommandResult | Promise<CommandResult>, policy?: import('./lib/source-admission-policy.mjs').AdmissionEvaluator}} [dependencies]
 * @returns {Promise<MergeIntentResult>}
 */
export async function submitMergeIntent(
  options,
  { exec = execute, policy = runSourceAdmission } = {}
) {
  const {
    repo,
    head,
    receiptDir = join(homedir(), '.local/state/jovie/native-merge-intent'),
    base = 'main',
    reconcileRemoval,
    reconciliationReceipt,
  } = options;
  const pr = Number(options.pr);
  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo ?? '') ||
    !/^[a-f0-9]{40}$/.test(head ?? '') ||
    !Number.isSafeInteger(pr) ||
    pr < 1 ||
    !base
  ) {
    throw new Error(
      'Explicit repository, positive PR number, and lowercase full 40-character head SHA required'
    );
  }
  if (
    Boolean(reconcileRemoval) !== Boolean(reconciliationReceipt) ||
    (reconcileRemoval && !/^[A-Za-z0-9_+/=-]{1,512}$/.test(reconcileRemoval))
  ) {
    throw new Error(
      'Reconciliation requires both an exact removal node ID and a receipt path'
    );
  }
  const [owner, name] = repo.split('/');
  const result = (status, reason, extra = {}) => ({
    status,
    reason,
    repo,
    pr,
    head,
    ...extra,
  });
  // Explicit owner reconciliation is a new bounded attempt for one removal,
  // never a generic retry flag. The file is evidence, not an alternate CI gate.
  // Receipt JSON: {schema:"jovie-native-merge-reconciliation/v1", repository,
  // prNumber, headSha, removalEventId, decision:"retry-once", owner, evidence}.
  // owner must match this request's authenticated GraphQL viewer. Keep the
  // persistent receipt directory when handing the operation to another host.
  let reconciliation;
  if (reconcileRemoval) {
    try {
      const text = readFileSync(reconciliationReceipt, 'utf8');
      if (Buffer.byteLength(text) > 65536) throw new Error('oversized receipt');
      reconciliation = JSON.parse(text);
      if (
        reconciliation?.schema !== 'jovie-native-merge-reconciliation/v1' ||
        reconciliation.repository !== repo ||
        reconciliation.prNumber !== pr ||
        reconciliation.headSha !== head ||
        reconciliation.removalEventId !== reconcileRemoval ||
        reconciliation.decision !== 'retry-once' ||
        typeof reconciliation.owner !== 'string' ||
        !reconciliation.owner.trim() ||
        typeof reconciliation.evidence !== 'string' ||
        !reconciliation.evidence.trim()
      ) {
        throw new Error('unbound reconciliation');
      }
    } catch {
      return result('blocked', 'reconciliation-receipt-invalid');
    }
  }
  const read = async () => {
    const response = await exec([
      'api',
      'graphql',
      '-f',
      `query=${QUERY}`,
      '-f',
      `owner=${owner}`,
      '-f',
      `name=${name}`,
      '-F',
      `number=${pr}`,
    ]);
    if (response.code !== 0) throw new Error('PR readback failed');
    const data = JSON.parse(response.stdout);
    const state = data.data?.repository?.pullRequest;
    if (
      data.errors?.length ||
      !state ||
      typeof state.isInMergeQueue !== 'boolean' ||
      !Array.isArray(state.timelineItems?.nodes) ||
      !['OPEN', 'CLOSED', 'MERGED'].includes(state.state)
    ) {
      throw new Error('Incomplete PR readback');
    }
    return { ...state, viewerLogin: data.data?.viewer?.login };
  };
  const disposition = state => {
    if (state.headRefOid !== head) return result('blocked', 'stale-head');
    if (state.baseRefName !== base) return result('blocked', 'unexpected-base');
    if (state.state === 'MERGED') return result('merged', 'native-merged');
    if (state.state !== 'OPEN') return result('blocked', 'closed');
    if (state.isMergeQueueEnabled !== true)
      return result('blocked', 'native-queue-not-enabled');
    if (state.isInMergeQueue) {
      const position = state.mergeQueueEntry?.position;
      return Number.isInteger(position) && position > 0
        ? result('queued', 'native-position-confirmed', { position })
        : result('unknown', 'queue-position-unconfirmed');
    }
    if (state.autoMergeRequest)
      return result('intent-recorded', 'native-auto-merge-enabled');
    if (state.isDraft !== false) return result('blocked', 'draft-or-unknown');
    if (state.mergeable !== 'MERGEABLE')
      return result('blocked', 'conflict-or-unknown');
    if (['CHANGES_REQUESTED', 'REVIEW_REQUIRED'].includes(state.reviewDecision))
      return result('blocked', 'review-required');
    const removal = state.timelineItems.nodes[0];
    // GitHub beforeCommit identifies the synthetic queue commit, not the PR
    // source commit. Its inequality with head never proves an old ejection.
    if (reconcileRemoval) {
      if (removal?.id !== reconcileRemoval)
        return result('blocked', 'reconciliation-removal-changed');
      if (
        typeof state.viewerLogin !== 'string' ||
        !state.viewerLogin ||
        state.viewerLogin.toLowerCase() !== reconciliation.owner.toLowerCase()
      )
        return result('blocked', 'reconciliation-owner-mismatch');
    } else if (removal) {
      return result('blocked', 'queue-ejected-requires-owner-reconciliation', {
        removalEventId: typeof removal.id === 'string' ? removal.id : undefined,
      });
    }
    return null;
  };
  let state;
  try {
    state = await read();
  } catch {
    return result('unknown', 'readback-failed');
  }
  const existing = disposition(state);
  if (existing) return existing;
  const checks = await exec([
    'pr',
    'checks',
    String(pr),
    '--repo',
    repo,
    '--required',
    '--json',
    'name,bucket',
  ]);
  let required;
  try {
    required = JSON.parse(checks.stdout);
  } catch {
    return result('unknown', 'required-checks-unavailable');
  }
  if (
    ![0, 8].includes(checks.code) ||
    !Array.isArray(required) ||
    required.length === 0 ||
    required.some(
      check =>
        !check.name ||
        !['pass', 'pending', 'skipping', 'fail', 'cancel'].includes(
          check.bucket
        )
    )
  ) {
    return result('blocked', 'required-checks-incomplete-or-failed');
  }
  if (required.some(check => ['fail', 'cancel'].includes(check.bucket)))
    return result('blocked', 'required-check-failed');
  let policyReceipt;
  try {
    let token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
    if (policy === runSourceAdmission && !token) {
      const auth = await exec(['auth', 'token']);
      if (auth.code === 0) token = auth.stdout.trim();
    }
    policyReceipt = await policy({
      repository: repo,
      prNumber: pr,
      expectedHead: head,
      token,
    });
  } catch {
    return result('unknown', 'source-policy-unavailable');
  }
  if (policyReceipt?.allowed !== true) {
    return result('blocked', 'source-policy-blocked', {
      blockers: policyReceipt?.blockers ?? [],
    });
  }
  // Revalidate after check lookup; --match-head-commit closes the final SHA race.
  try {
    state = await read();
  } catch {
    return result('unknown', 'readback-failed');
  }
  const changed = disposition(state);
  if (changed) return changed;
  // Write-ahead, exclusive claim survives ambiguous responses and coordinator
  // restarts. Share this directory when moving this incident to another host.
  const key = createHash('sha256')
    .update(
      `${repo.toLowerCase()}:${pr}:${head}${reconcileRemoval ? `:removal:${reconcileRemoval}` : ''}`
    )
    .digest('hex');
  const receipt = join(receiptDir, `${key}.json`);
  try {
    mkdirSync(receiptDir, { recursive: true, mode: 0o700 });
  } catch {
    return result('unknown', 'receipt-write-failed', { receipt });
  }
  try {
    writeFileSync(
      receipt,
      JSON.stringify(
        result('unknown', 'request-attempted', {
          schema: 'jovie-native-merge-intent/v1',
          at: new Date().toISOString(),
          ...(reconcileRemoval
            ? { removalEventId: reconcileRemoval, reconciliation }
            : {}),
        })
      ),
      { flag: 'wx', mode: 0o600 }
    );
  } catch (error) {
    return result(
      'unknown',
      error.code === 'EEXIST'
        ? 'previous-attempt-requires-owner-reconciliation'
        : 'receipt-write-failed',
      { receipt }
    );
  }
  let request;
  try {
    request = await exec([
      'pr',
      'merge',
      String(pr),
      '--repo',
      repo,
      '--auto',
      '--match-head-commit',
      head,
    ]);
  } catch {
    request = { code: 1 };
  }
  // Even a successful CLI exit is not evidence of queue admission.
  try {
    state = await read();
    const confirmed = disposition(state);
    if (confirmed)
      return { ...confirmed, receipt, requestExitCode: request.code };
  } catch {
    /* Uncertain response: retain the claim and never retry. */
  }
  return result('unknown', 'request-outcome-unconfirmed', {
    receipt,
    requestExitCode: request.code,
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const result = await submitMergeIntent(parseArgs(process.argv.slice(2)));
    console.log(JSON.stringify(result));
    if (!['queued', 'intent-recorded', 'merged'].includes(result.status))
      process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
