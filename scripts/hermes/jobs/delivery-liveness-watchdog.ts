#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import {
  DELIVERY_LIVENESS_DIR,
  type DeliveryLease,
  readDeliveryLease,
  recordReceipt,
  startInternalRemediation,
  watchdogDecision,
  writeDeliveryLease,
} from '../lib/delivery-liveness';
import { HERMES_PATHS } from '../lib/hermes-paths';
import { logJobEvent, withJobLogging } from '../lib/jobs-log';

const JOB = 'delivery-liveness-watchdog';
const SUMMER_OUTBOX = join(HERMES_PATHS.stateDir, 'summer-notification-outbox');

function run(args: ReadonlyArray<string>, cwd?: string): string {
  return execFileSync(args[0], args.slice(1), {
    cwd,
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 5 * 1024 * 1024,
  });
}

function refreshGithubReceipts(lease: DeliveryLease): DeliveryLease {
  if (!lease.pr) return lease;
  let current = lease;
  const raw = run([
    'gh',
    'pr',
    'view',
    String(lease.pr),
    '--repo',
    lease.repo,
    '--json',
    'state,headRefOid,mergeCommit,statusCheckRollup,url',
  ]);
  const pr = JSON.parse(raw) as {
    state?: string;
    headRefOid?: string;
    mergeCommit?: { oid?: string } | null;
    statusCheckRollup?: ReadonlyArray<{
      status?: string;
      conclusion?: string | null;
    }>;
    url?: string;
  };
  const now = new Date().toISOString();
  const checks = pr.statusCheckRollup ?? [];
  const settled =
    checks.length > 0 &&
    checks.every(check => {
      const conclusion = check.conclusion?.toUpperCase();
      return (
        check.status?.toUpperCase() === 'COMPLETED' &&
        ['SUCCESS', 'SKIPPED', 'NEUTRAL'].includes(conclusion ?? '')
      );
    });
  if (settled && pr.headRefOid) {
    current = recordReceipt(current, {
      tier: 'ci',
      observedAt: now,
      subject: pr.headRefOid,
      evidence: `${pr.url ?? lease.prUrl}#checks`,
    });
  }
  const mergeSha = pr.mergeCommit?.oid;
  if (pr.state === 'MERGED' && mergeSha) {
    current = recordReceipt(current, {
      tier: 'merge',
      observedAt: now,
      subject: mergeSha,
      evidence: pr.url ?? lease.prUrl ?? `PR #${lease.pr}`,
    });
    current = refreshProductionReceipts(current, mergeSha, now);
  }
  return current;
}

function refreshProductionReceipts(
  lease: DeliveryLease,
  mergeSha: string,
  now: string
): DeliveryLease {
  if (
    !lease.requestedOutcomes.includes('deploy') &&
    !lease.requestedOutcomes.includes('runtime')
  ) {
    return lease;
  }
  const runs = JSON.parse(
    run([
      'gh',
      'run',
      'list',
      '--repo',
      lease.repo,
      '--workflow',
      'production-controller.yml',
      '--commit',
      mergeSha,
      '--json',
      'databaseId,status,conclusion,url,headSha',
      '--limit',
      '10',
    ])
  ) as ReadonlyArray<{
    databaseId: number;
    status: string;
    conclusion: string | null;
    url: string;
    headSha: string;
  }>;
  const exact = runs.find(
    candidate =>
      candidate.headSha === mergeSha &&
      candidate.status === 'completed' &&
      candidate.conclusion === 'success'
  );
  if (!exact) return lease;
  const view = JSON.parse(
    run([
      'gh',
      'run',
      'view',
      String(exact.databaseId),
      '--repo',
      lease.repo,
      '--json',
      'jobs',
    ])
  ) as {
    jobs?: ReadonlyArray<{
      name: string;
      status: string;
      conclusion: string | null;
      url: string;
    }>;
  };
  const successful = (name: string) =>
    view.jobs?.find(
      job =>
        job.name === name &&
        job.status === 'completed' &&
        job.conclusion === 'success'
    );
  const verified = successful('Production Verified');
  let current = lease;
  if (verified) {
    current = recordReceipt(current, {
      tier: 'deploy',
      observedAt: now,
      subject: mergeSha,
      evidence: verified.url,
    });
  }
  const runtime = successful('Post-Deploy Auth Smoke (Production)');
  if (verified && runtime) {
    current = recordReceipt(current, {
      tier: 'runtime',
      observedAt: now,
      subject: mergeSha,
      evidence: runtime.url,
    });
  }
  return current;
}

function queueSummerPacket(lease: DeliveryLease): void {
  if (!lease.blocked || lease.blocked.criticalLane !== 'summer') return;
  mkdirSync(SUMMER_OUTBOX, { recursive: true });
  const path = join(
    SUMMER_OUTBOX,
    `${lease.repo.replaceAll('/', '--')}--${lease.issue}.json`
  );
  const tmp = `${path}.tmp`;
  const configured = Boolean(
    process.env.HERMES_SUMMER_NOTIFICATION_DESTINATION &&
      process.env.HERMES_SUMMER_NOTIFICATION_AUTHORITY
  );
  writeFileSync(
    tmp,
    `${JSON.stringify(
      {
        schema: 'jovie-summer-decision-packet/v1',
        repo: lease.repo,
        issue: lease.issue,
        state: configured ? 'ready' : 'queued_unconfigured',
        destination: configured
          ? process.env.HERMES_SUMMER_NOTIFICATION_DESTINATION
          : null,
        authority: configured
          ? process.env.HERMES_SUMMER_NOTIFICATION_AUTHORITY
          : null,
        packet: lease.blocked,
      },
      null,
      2
    )}\n`
  );
  renameSync(tmp, path);
}

function retryOrReassign(
  lease: DeliveryLease,
  reason: 'verification_deadline' | 'stale_receipt'
): DeliveryLease {
  const remediating = startInternalRemediation({
    lease,
    evidence: `watchdog:${reason}`,
    owner: 'codex-issue-shipper',
  });
  try {
    run([
      'gh',
      'issue',
      'edit',
      String(lease.issue),
      '--repo',
      lease.repo,
      '--remove-label',
      'codex-in-progress',
    ]);
  } catch {
    // The label may already be absent. The durable remediation receipt still
    // advances and a later watchdog tick retries GitHub reconciliation.
  }
  try {
    run([
      'gh',
      'issue',
      'comment',
      String(lease.issue),
      '--repo',
      lease.repo,
      '--body',
      `Delivery verification remained active but lacked a fresh receipt (${reason}). The controller released the stale claim for retry/reassignment. Start receipt: \`${remediating.acceptedOwner?.startReceipt}\`.`,
    ]);
  } catch {
    // The machine-readable local receipt is authoritative during a transient
    // GitHub outage; the next tick retries external reconciliation.
  }
  return remediating;
}

async function main(): Promise<void> {
  await withJobLogging(JOB, async () => {
    if (!existsSync(DELIVERY_LIVENESS_DIR)) return;
    for (const name of readdirSync(DELIVERY_LIVENESS_DIR)) {
      if (!name.endsWith('.json')) continue;
      const path = join(DELIVERY_LIVENESS_DIR, name);
      const lease = readDeliveryLease(path);
      if (!lease) {
        logJobEvent({ job: JOB, event: 'invalid_lease', path });
        continue;
      }
      let refreshed = lease;
      try {
        refreshed = refreshGithubReceipts(lease);
      } catch (error) {
        logJobEvent({
          job: JOB,
          event: 'receipt_refresh_failed',
          issue: lease.issue,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      const decision = watchdogDecision(refreshed);
      if (decision.action === 'retry_or_reassign') {
        try {
          refreshed = retryOrReassign(refreshed, decision.reason);
        } catch (error) {
          logJobEvent({
            job: JOB,
            event: 'retry_reassign_failed',
            issue: lease.issue,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      } else if (decision.action === 'external_authority') {
        queueSummerPacket(refreshed);
      }
      writeDeliveryLease(refreshed, path);
      logJobEvent({
        job: JOB,
        event: 'lease_checked',
        issue: refreshed.issue,
        status: refreshed.status,
        action: decision.action,
        lastReceiptAt: refreshed.lastReceiptAt,
      });
    }
  });
}

void main().catch(error => {
  logJobEvent({
    job: JOB,
    event: 'fatal',
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
