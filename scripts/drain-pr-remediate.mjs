#!/usr/bin/env node
/** Phase 2 of /drain: refresh or escalate exact stale agent PR heads. */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { tryGitHubRebase } from './lib/github-update-branch.mjs';
import {
  isAgentBranch,
  isHardGated,
  isSameRepoPr,
  listBlockedAgentPrs,
} from './lib/pr-check-failures.mjs';
import {
  createGhRunner,
  readPullRequestQueueState,
} from './merge-queue-backend.mjs';

const execFileAsync = promisify(execFile);

function parseArgs(argv) {
  const options = {
    repo: process.env.REPO ?? process.env.GITHUB_REPOSITORY ?? 'JovieInc/Jovie',
    baseRef: 'main',
    expectedBaseOid: process.env.DRAIN_REMEDIATE_EXPECTED_MAIN_SHA ?? '',
    dryRun: process.env.DRAIN_REMEDIATE_APPLY !== '1',
    maxPerRun: Number.parseInt(
      process.env.DRAIN_REMEDIATE_MAX_PER_RUN ?? '24',
      10
    ),
    cooldownHours: Number.parseInt(
      process.env.DRAIN_REMEDIATE_COOLDOWN_HOURS ?? '4',
      10
    ),
    limit: 200,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--repo':
        options.repo = argv[++index];
        break;
      case '--base':
        options.baseRef = argv[++index];
        break;
      case '--expected-base-oid':
        options.expectedBaseOid = argv[++index];
        break;
      case '--apply':
        options.dryRun = false;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--max-per-run':
        options.maxPerRun = Number.parseInt(argv[++index], 10);
        break;
      case '--cooldown-hours':
        options.cooldownHours = Number.parseInt(argv[++index], 10);
        break;
      case '--limit':
        options.limit = Number.parseInt(argv[++index], 10);
        break;
      case '--json':
        options.json = true;
        break;
      case '--help':
      case '-h':
        console.log(`Usage: node scripts/drain-pr-remediate.mjs [options]
  --apply / --dry-run
  --repo OWNER/REPO
  --base REF
  --expected-base-oid SHA
  --max-per-run N
  --cooldown-hours N
  --limit N
  --json
`);
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(options.maxPerRun) || options.maxPerRun < 1) {
    throw new Error('--max-per-run must be a positive integer');
  }
  if (!Number.isInteger(options.cooldownHours) || options.cooldownHours < 0) {
    throw new Error('--cooldown-hours must be a non-negative integer');
  }
  if (!/^[0-9a-f]{40}$/.test(options.expectedBaseOid)) {
    throw new Error(
      'DRAIN_REMEDIATE_EXPECTED_MAIN_SHA/--expected-base-oid must be an exact lowercase 40-character SHA'
    );
  }

  return options;
}

function hoursSince(isoTimestamp, nowMs = Date.now()) {
  if (!isoTimestamp) return Number.POSITIVE_INFINITY;
  const deltaMs = nowMs - Date.parse(isoTimestamp);
  if (!Number.isFinite(deltaMs) || deltaMs < -5 * 60 * 1000) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, deltaMs) / (1000 * 60 * 60);
}

function hasPrLabel(pr, labelName) {
  return (pr.labels ?? []).some(label => (label.name ?? label) === labelName);
}

export function rotateRemediationCandidates(
  candidates,
  nowMs,
  intervalMs = 15 * 60 * 1000
) {
  if (!Array.isArray(candidates) || candidates.length < 2) {
    return [...(candidates ?? [])];
  }
  const ordered = [...candidates].sort(
    (left, right) => Number(left.number) - Number(right.number)
  );
  const slot = Math.floor(nowMs / intervalMs);
  const start = ((slot % ordered.length) + ordered.length) % ordered.length;
  return [...ordered.slice(start), ...ordered.slice(0, start)];
}

function recordLabelReconciliationFailure(item, operation, error) {
  const detail = `${error?.stderr ?? error?.message ?? error ?? 'unknown error'}`
    .trim()
    .slice(0, 500);
  item.result = 'escalated';
  item.category = 'label_reconciliation_failure';
  item.reason = `${item.reason}; ${operation} failed: ${detail}`;
}

export function classifyLiveRemediationEligibility({
  snapshot,
  repo,
  expectedHeadRefName,
  expectedHeadOid,
  expectedBaseRefName,
  expectedBaseOid,
  nativeQueueState,
}) {
  const observedHeadOid = snapshot?.headRefOid ?? null;
  if (
    snapshot?.state !== 'OPEN' ||
    snapshot?.isDraft ||
    snapshot?.headRefName !== expectedHeadRefName ||
    !isAgentBranch(snapshot?.headRefName) ||
    !isSameRepoPr(snapshot ?? {}, repo)
  ) {
    return {
      ok: false,
      category: 'stale_pr',
      observedHeadOid,
      reason:
        'PR state, draft status, agent branch, or same-repository ownership changed at the mutation boundary',
    };
  }
  if (
    snapshot.baseRefName !== expectedBaseRefName ||
    snapshot.baseRefOid !== expectedBaseOid
  ) {
    return {
      ok: false,
      category: 'stale_base',
      observedHeadOid,
      reason: 'exact PR base changed at the mutation boundary',
    };
  }
  if (snapshot.headRefOid !== expectedHeadOid) {
    return {
      ok: false,
      category: 'stale_head',
      observedHeadOid,
      reason: 'exact PR head changed at the mutation boundary',
    };
  }
  if (
    !nativeQueueState ||
    nativeQueueState.headRefOid?.toLowerCase() !== expectedHeadOid ||
    nativeQueueState.queued !== false ||
    nativeQueueState.autoMergeEnabled !== false
  ) {
    return {
      ok: false,
      category: 'policy_exception',
      observedHeadOid,
      reason:
        'native queue or auto-merge ownership changed at the mutation boundary',
    };
  }
  if (isHardGated(snapshot.labels)) {
    const labels = (snapshot.labels ?? []).map(label => label.name ?? label);
    return {
      ok: false,
      category: 'policy_exception',
      observedHeadOid,
      reason: `PR gained a controller-excluded label at the mutation boundary: ${labels.join(', ')}`,
    };
  }
  if (snapshot.mergeable !== 'MERGEABLE') {
    return {
      ok: false,
      category:
        snapshot.mergeable === 'CONFLICTING'
          ? 'conflict'
          : 'verification_failure',
      observedHeadOid,
      reason: `PR mergeability changed to ${snapshot.mergeable ?? 'UNKNOWN'} at the mutation boundary`,
    };
  }
  return { ok: true, observedHeadOid };
}

async function revalidateRemediationEligibility({
  repo,
  pr,
  expectedBaseRefName,
  expectedBaseOid,
  expectedHeadOid,
  timeoutMs,
}) {
  const [{ stdout }, nativeQueueState] = await Promise.all([
    execFileAsync(
      'gh',
      [
        'pr',
        'view',
        String(pr.number),
        '--repo',
        repo,
        '--json',
        'state,isDraft,mergeable,labels,headRefName,headRefOid,baseRefName,baseRefOid,headRepository,headRepositoryOwner,isCrossRepository',
      ],
      { encoding: 'utf8', timeout: Math.max(1, timeoutMs) }
    ),
    readPullRequestQueueState({
      backend: 'native',
      repository: repo,
      number: pr.number,
      runner: createGhRunner({ timeoutMs: Math.max(1, timeoutMs) }),
    }),
  ]);
  return classifyLiveRemediationEligibility({
    snapshot: JSON.parse(stdout),
    repo,
    expectedHeadRefName: pr.headRefName,
    expectedHeadOid,
    expectedBaseRefName,
    expectedBaseOid,
    nativeQueueState,
  });
}

const REMEDIATION_RECEIPT_SCHEMA = 'jovie-gem-remediation/v1';
const REMEDIATION_COMMENT_MARKER = 'drain-auto-rebase';

function receiptDisposition(pr, item) {
  if (item.requiresExactRereadBeforeRetry) {
    return { owner: 'Gem', nextAction: 'reread_exact_head_before_retry' };
  }
  if (item.category === 'conflict') {
    return { owner: 'Symphony', nextAction: 'resolve_merge_conflict' };
  }
  if (item.category === 'auth') {
    return { owner: 'Gem', nextAction: 'restore_controller_authority' };
  }
  if (item.category === 'policy_cooldown') {
    return { owner: 'Gem', nextAction: 'retry_after_cooldown' };
  }
  if (item.category === 'policy_exception') {
    return { owner: 'Gem', nextAction: 'honor_policy_hold' };
  }
  if (
    item.category === 'stale_head' ||
    item.category === 'stale_pr' ||
    item.category === 'stale_base'
  ) {
    return { owner: 'Gem', nextAction: 'refresh_exact_head_inventory' };
  }
  if (
    item.category === 'transient' ||
    item.category === 'verification_failure' ||
    item.category === 'snapshot_failure' ||
    item.category === 'api_failure' ||
    item.category === 'label_reconciliation_failure'
  ) {
    return { owner: 'Gem', nextAction: 'retry_exact_head' };
  }
  if (item.action === 'rebased') {
    return { owner: 'Gem', nextAction: 'await_current_head_ci' };
  }
  if ((pr.controlPlaneFailures ?? []).length > 0) {
    return { owner: 'Gem', nextAction: 'replay_exact_head_controller' };
  }
  if ((pr.failures ?? []).length > 0) {
    return { owner: 'Symphony', nextAction: 'repair_required_checks' };
  }
  return { owner: 'Gem', nextAction: 'observe_current_head' };
}

export function buildRemediationReceipt({
  repo,
  pr,
  item,
  observedAt,
  runUrl = null,
}) {
  const expectedHead = item.expectedHeadOid ?? pr.headRefOid;
  if (!/^[0-9a-f]{40}$/.test(expectedHead ?? '')) {
    throw new Error('remediation receipt requires an exact lowercase PR head');
  }
  const disposition = receiptDisposition(pr, item);
  const receipt = {
    schema: REMEDIATION_RECEIPT_SCHEMA,
    receiptKey: `${repo}#${pr.number}@${expectedHead}`,
    repo,
    pr: pr.number,
    expectedHead,
    observedHead: item.observedHeadOid ?? null,
    baseRef: item.baseRefName ?? pr.baseRefName ?? 'main',
    reasons: pr.reasons ?? [],
    failures: pr.failures ?? [],
    controlPlaneFailures: pr.controlPlaneFailures ?? [],
    action: item.action,
    result: item.result,
    category: item.category ?? null,
    reason: item.reason,
    mutationAttempted: Boolean(item.mutationAttempted),
    mutationApplied:
      item.mutationApplied === null ? null : Boolean(item.mutationApplied),
    requiresExactRereadBeforeRetry: Boolean(
      item.requiresExactRereadBeforeRetry
    ),
    owner: disposition.owner,
    nextAction: disposition.nextAction,
    observedAt,
    controllerRun: runUrl,
  };
  receipt.receiptFingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        schema: receipt.schema,
        receiptKey: receipt.receiptKey,
        reasons: receipt.reasons,
        failures: receipt.failures,
        controlPlaneFailures: receipt.controlPlaneFailures,
        action: receipt.action,
        result: receipt.result,
        category: receipt.category,
        reason: receipt.reason,
        mutationAttempted: receipt.mutationAttempted,
        mutationApplied: receipt.mutationApplied,
        owner: receipt.owner,
        nextAction: receipt.nextAction,
      })
    )
    .digest('hex');
  return receipt;
}

function formatRemediationReceipt(receipt) {
  return [
    '## Gem remediation receipt',
    '',
    `Exact head \`${receipt.expectedHead}\` was classified as \`${receipt.category ?? receipt.action}\`.`,
    '',
    '```json',
    JSON.stringify(receipt, null, 2),
    '```',
  ].join('\n');
}

async function labelPr(repo, prNumber, labelName) {
  await execFileAsync(
    'gh',
    ['pr', 'edit', String(prNumber), '-R', repo, '--add-label', labelName],
    { encoding: 'utf8' }
  );
}

async function removeLabelPr(repo, prNumber, labelName) {
  try {
    await execFileAsync(
      'gh',
      [
        'api',
        '-X',
        'DELETE',
        `repos/${repo}/issues/${prNumber}/labels/${encodeURIComponent(labelName)}`,
      ],
      { encoding: 'utf8' }
    );
  } catch (error) {
    const detail = `${error?.stderr ?? ''} ${error?.message ?? ''}`;
    if (/HTTP 404|Not Found/i.test(detail)) return;
    throw error;
  }
}

async function commentPr(repo, prNumber, marker, body, receiptFingerprint) {
  await execFileAsync(
    'bash',
    [
      join(
        dirname(fileURLToPath(import.meta.url)),
        'lib',
        'upsert-pr-comment.sh'
      ),
      String(prNumber),
      marker,
      body,
      receiptFingerprint,
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_REPOSITORY: repo,
        BOT_COMMENT_TRUSTED_AUTHORS_JSON: '["jovie-bot[bot]"]',
      },
    }
  );
}

export async function remediateBlockedPrs(options, dependencies = {}) {
  if (!/^[0-9a-f]{40}$/.test(options.expectedBaseOid ?? '')) {
    throw new Error(
      'remediation requires expectedBaseOid as an exact lowercase 40-character SHA'
    );
  }
  const listBlockedAgentPrsImpl =
    dependencies.listBlockedAgentPrsImpl ?? listBlockedAgentPrs;
  const rebaseImpl = dependencies.rebaseImpl ?? tryGitHubRebase;
  const labelPrImpl = dependencies.labelPrImpl ?? labelPr;
  const removeLabelPrImpl = dependencies.removeLabelPrImpl ?? removeLabelPr;
  const commentPrImpl = dependencies.commentPrImpl ?? commentPr;
  const nowMs = dependencies.nowMs ?? Date.now();
  const observedAt = new Date(nowMs).toISOString();
  const runUrl =
    dependencies.runUrl ??
    (process.env.GITHUB_SERVER_URL &&
    process.env.GITHUB_REPOSITORY &&
    process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : null);

  const blocked = await listBlockedAgentPrsImpl(options.repo, {
    limit: options.limit,
  });
  const candidates = rotateRemediationCandidates(blocked, nowMs);

  const results = [];
  let applied = 0;
  let mutationBudgetUsed = 0;
  let processed = 0;

  console.log('=== REMEDIATE (exact stale agent heads → refresh/escalate) ===');
  console.log(
    `mode=${options.dryRun ? 'dry-run' : 'apply'} maxPerRun=${options.maxPerRun} cooldownHours=${options.cooldownHours}`
  );

  for (const pr of candidates) {
    if (processed >= options.maxPerRun) {
      console.log(
        `  remediation cap reached (${processed}/${options.maxPerRun}); remaining candidates skipped`
      );
      break;
    }
    // No-op and escalation paths can still query or write a receipt. Charge
    // the pass budget before candidate-specific external work so high-frequency
    // controller events cannot make receipt handling unbounded.
    processed += 1;

    // PR updatedAt includes labels/comments, including our own receipt upsert.
    // Cooldown must bind to the exact head commit or controller chatter can
    // postpone remediation forever.
    const hours = hoursSince(pr.headUpdatedAt, nowMs);
    const hasConflictLabel = hasPrLabel(pr, 'needs-conflict-resolution');
    const timeSensitive = (pr.reasons ?? []).some(reason =>
      [
        'branch_behind',
        'merge_conflict',
        'stale_conflict_label',
      ].includes(reason)
    );
    if (!Number.isFinite(hours)) {
      const item = {
        number: pr.number,
        headRefName: pr.headRefName,
        action: 'skip_unknown_head_age',
        result: 'escalated',
        category: 'snapshot_failure',
        expectedHeadOid: pr.headRefOid,
        reason:
          'exact head commit time is unavailable; refusing branch mutation',
        failures: pr.failures,
      };
      results.push(item);
      if (!options.dryRun) {
        const receipt = buildRemediationReceipt({
          repo: options.repo,
          pr,
          item,
          observedAt,
          runUrl,
        });
        await commentPrImpl(
          options.repo,
          pr.number,
          `${REMEDIATION_COMMENT_MARKER}-${receipt.expectedHead}`,
          formatRemediationReceipt(receipt),
          receipt.receiptFingerprint
        );
      }
      console.log(
        `  #${pr.number} [${pr.headRefName}] exact head age unavailable; escalation recorded`
      );
      continue;
    }
    if (hours < options.cooldownHours && !hasConflictLabel && !timeSensitive) {
      const eligibleAt = new Date(
        Date.parse(pr.headUpdatedAt) + options.cooldownHours * 60 * 60 * 1000
      ).toISOString();
      const item = {
        number: pr.number,
        headRefName: pr.headRefName,
        action: 'skip_cooldown',
        result: 'no_action',
        category: 'policy_cooldown',
        expectedHeadOid: pr.headRefOid,
        reason: `exact head cooldown is active until ${eligibleAt}`,
        failures: pr.failures,
      };
      results.push(item);
      if (!options.dryRun) {
        const receipt = buildRemediationReceipt({
          repo: options.repo,
          pr,
          item,
          observedAt,
          runUrl,
        });
        await commentPrImpl(
          options.repo,
          pr.number,
          `${REMEDIATION_COMMENT_MARKER}-${receipt.expectedHead}`,
          formatRemediationReceipt(receipt),
          receipt.receiptFingerprint
        );
      }
      console.log(
        `  #${pr.number} [${pr.headRefName}] skip exact-head cooldown (${hours.toFixed(1)}h) — ${pr.failures.join(', ')}`
      );
      continue;
    }

    console.log(
      `  #${pr.number} [${pr.headRefName}] remediation candidate — ${(pr.reasons ?? []).join(', ') || pr.failures.join(', ')}`
    );

    const rebase = await rebaseImpl({
      repo: options.repo,
      pr,
      expectedBaseRefName: options.baseRef,
      expectedBaseOid: options.expectedBaseOid,
      expectedHeadOid: pr.headRefOid,
      preMutationCheckImpl: input =>
        revalidateRemediationEligibility({ ...input, pr }),
      dryRun: options.dryRun,
    });
    const consumedBudget = options.dryRun
      ? Boolean(rebase.updated)
      : Boolean(rebase.mutationAttempted);
    if (consumedBudget) mutationBudgetUsed += 1;

    const baseDriftNoAction =
      !rebase.ok &&
      rebase.category === 'stale_base' &&
      !rebase.mutationAttempted;
    const item = {
      number: pr.number,
      headRefName: pr.headRefName,
      action: baseDriftNoAction
        ? 'skip_stale_base'
        : rebase.ok
          ? rebase.updated
            ? 'rebased'
            : 'rebase_noop'
          : 'rebase_failed',
      result: baseDriftNoAction
        ? 'no_action'
        : rebase.ok
          ? rebase.updated
            ? 'refreshed'
            : 'no_action'
          : 'escalated',
      reason: rebase.reason,
      failures: pr.failures,
      conflict: Boolean(rebase.conflict),
      dryRun: Boolean(rebase.dryRun),
      category: rebase.category ?? null,
      baseRefName: rebase.baseRefName ?? options.baseRef,
      expectedHeadOid: rebase.expectedHeadOid ?? pr.headRefOid,
      observedHeadOid: rebase.observedHeadOid ?? null,
      mutationAttempted: Boolean(rebase.mutationAttempted),
      mutationApplied:
        rebase.mutationApplied === null
          ? null
          : Boolean(rebase.mutationApplied),
      requiresExactRereadBeforeRetry: Boolean(
        rebase.requiresExactRereadBeforeRetry
      ),
      consumedBudget,
    };
    results.push(item);

    if (!rebase.ok) {
      if (!options.dryRun) {
        const receipt = buildRemediationReceipt({
          repo: options.repo,
          pr,
          item,
          observedAt,
          runUrl,
        });
        await commentPrImpl(
          options.repo,
          pr.number,
          `${REMEDIATION_COMMENT_MARKER}-${receipt.expectedHead}`,
          formatRemediationReceipt(receipt),
          receipt.receiptFingerprint
        );
        // The exact-head receipt is the durable escalation selector; the label
        // is only a PR-scoped routing aid. Persist the receipt first so a
        // failed comment cannot leave a non-head-bound label that suppresses
        // escalation for this or a later conflicting head.
        if (rebase.conflict) {
          let labelReconciliationFailed = false;
          try {
            await labelPrImpl(
              options.repo,
              pr.number,
              'needs-conflict-resolution'
            );
          } catch (error) {
            recordLabelReconciliationFailure(
              item,
              'recording needs-conflict-resolution',
              error
            );
            labelReconciliationFailed = true;
          }
          if (labelReconciliationFailed) {
            const reconciliationReceipt = buildRemediationReceipt({
              repo: options.repo,
              pr,
              item,
              observedAt,
              runUrl,
            });
            await commentPrImpl(
              options.repo,
              pr.number,
              `${REMEDIATION_COMMENT_MARKER}-${reconciliationReceipt.expectedHead}`,
              formatRemediationReceipt(reconciliationReceipt),
              reconciliationReceipt.receiptFingerprint
            );
          }
        }
      }
      console.log(`    !! ${rebase.reason}`);
      continue;
    }

    if (!rebase.updated) {
      if (!options.dryRun && hasConflictLabel) {
        try {
          await removeLabelPrImpl(
            options.repo,
            pr.number,
            'needs-conflict-resolution'
          );
        } catch (error) {
          recordLabelReconciliationFailure(
            item,
            'clearing stale needs-conflict-resolution',
            error
          );
        }
      }
      if (!options.dryRun) {
        const receipt = buildRemediationReceipt({
          repo: options.repo,
          pr,
          item,
          observedAt,
          runUrl,
        });
        await commentPrImpl(
          options.repo,
          pr.number,
          `${REMEDIATION_COMMENT_MARKER}-${receipt.expectedHead}`,
          formatRemediationReceipt(receipt),
          receipt.receiptFingerprint
        );
      }
      console.log(`    - ${rebase.reason}`);
      continue;
    }

    applied += 1;

    if (!options.dryRun) {
      if (hasConflictLabel) {
        try {
          await removeLabelPrImpl(
            options.repo,
            pr.number,
            'needs-conflict-resolution'
          );
        } catch (error) {
          recordLabelReconciliationFailure(
            item,
            'clearing stale needs-conflict-resolution after refresh',
            error
          );
        }
      }
      const receipt = buildRemediationReceipt({
        repo: options.repo,
        pr,
        item,
        observedAt,
        runUrl,
      });
      await commentPrImpl(
        options.repo,
        pr.number,
        `${REMEDIATION_COMMENT_MARKER}-${receipt.expectedHead}`,
        formatRemediationReceipt(receipt),
        receipt.receiptFingerprint
      );
      console.log(`    ✓ ${rebase.reason}; awaiting current-head CI`);
    } else {
      console.log(`    [dry-run] ${rebase.reason}`);
    }
  }

  if (blocked.length === 0) {
    console.log('  (no blocked agent PRs)');
  }

  console.log(
    `=== remediate done (processed=${processed}, applied=${applied}, mutationBudgetUsed=${mutationBudgetUsed}, dryRun=${options.dryRun}) ===`
  );
  return {
    blocked: blocked.length,
    processed,
    applied,
    mutationBudgetUsed,
    results,
    dryRun: options.dryRun,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const summary = await remediateBlockedPrs(options);
  if (options.json) {
    console.log(JSON.stringify(summary));
  }
}

const isMain =
  process.argv[1] === fileURLToPath(import.meta.url) ||
  process.argv[1]?.endsWith('drain-pr-remediate.mjs');

if (isMain) {
  main().catch(error => {
    console.error(
      error instanceof Error ? (error.stack ?? error.message) : error
    );
    process.exit(1);
  });
}
