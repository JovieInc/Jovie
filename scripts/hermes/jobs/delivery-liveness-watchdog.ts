#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import {
  buildTriageLivenessReceipt,
  DELIVERY_LIVENESS_DIR,
  type DeliveryLease,
  type LinearActiveIssue,
  linearActiveIssueDecision,
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
const TRIAGE_RECEIPT = join(
  HERMES_PATHS.stateDir,
  'triage-liveness-latest.json'
);
const IN_PROGRESS_RECEIPT = join(
  HERMES_PATHS.stateDir,
  'linear-in-progress-liveness-latest.json'
);
const JOVIE_TEAM_ID = 'bdc09edc-f91c-4a06-b308-74b4fcf093f8';

function run(args: ReadonlyArray<string>, cwd?: string): string {
  return execFileSync(args[0], args.slice(1), {
    cwd,
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 5 * 1024 * 1024,
  });
}

function linearApiKey(): string {
  if (process.env.LINEAR_API_KEY) return process.env.LINEAR_API_KEY;
  const path = join(
    process.env.HOME ?? '',
    '.config',
    'symphony',
    'linear.env'
  );
  const match = existsSync(path)
    ? /^LINEAR_API_KEY=(.+)$/m.exec(readFileSync(path, 'utf8'))
    : null;
  if (!match) throw new Error('Linear credential unavailable');
  return match[1].trim().replace(/^['"]|['"]$/g, '');
}

async function linearGraphql<T>(
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const response = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      Authorization: linearApiKey(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok)
    throw new Error(`Linear request failed (${response.status})`);
  const payload = (await response.json()) as {
    data?: T;
    errors?: ReadonlyArray<unknown>;
  };
  if (payload.errors?.length) throw new Error('Linear GraphQL returned errors');
  if (!payload.data) throw new Error('Linear GraphQL returned no data');
  return payload.data;
}

async function refreshLinearInProgressLiveness(): Promise<void> {
  const now = new Date();
  const data = await linearGraphql<{
    team: {
      states: { nodes: ReadonlyArray<{ id: string; name: string }> };
      issues: {
        nodes: ReadonlyArray<
          Omit<LinearActiveIssue, 'comments'> & {
            comments: {
              nodes: LinearActiveIssue['comments'];
              pageInfo: { hasPreviousPage: boolean };
            };
          }
        >;
        pageInfo: { hasNextPage: boolean };
      };
    };
  }>(
    `query ActiveIssues($teamId: String!) {
      team(id: $teamId) {
        states { nodes { id name } }
        issues(first: 250, filter: { state: { name: { eq: "In Progress" } } }) {
          nodes {
            id identifier
            assignee { id name }
            delegate { id name }
            comments(last: 50) {
              nodes { body updatedAt }
              pageInfo { hasPreviousPage }
            }
          }
          pageInfo { hasNextPage }
        }
      }
    }`,
    { teamId: JOVIE_TEAM_ID }
  );
  if (data.team.issues.pageInfo.hasNextPage) {
    throw new Error('Linear In Progress query was incomplete');
  }
  if (
    data.team.issues.nodes.some(
      issue => issue.comments.pageInfo.hasPreviousPage
    )
  ) {
    throw new Error('Linear In Progress comment query was incomplete');
  }
  const backlog = data.team.states.nodes.find(
    state => state.name === 'Backlog'
  );
  if (!backlog) throw new Error('Linear Backlog state unavailable');

  const retained: string[] = [];
  const reclaimed: Array<{ identifier: string; reason: string }> = [];
  for (const issue of data.team.issues.nodes) {
    const decision = linearActiveIssueDecision(
      { ...issue, comments: issue.comments.nodes },
      now
    );
    if (decision.action === 'retain') {
      retained.push(issue.identifier);
      continue;
    }
    await linearGraphql(
      `mutation Reclaim($id: String!, $input: IssueUpdateInput!) {
        issueUpdate(id: $id, input: $input) { success }
      }`,
      {
        id: issue.id,
        input: { stateId: backlog.id, assigneeId: null, delegateId: null },
      }
    );
    await linearGraphql(
      `mutation Receipt($input: CommentCreateInput!) {
        commentCreate(input: $input) { success }
      }`,
      {
        input: {
          issueId: issue.id,
          body: `Automated liveness reclaim: moved to Backlog without closing because the In Progress lease failed the five-minute machine-receipt check (${decision.reason}). Stale assignee/delegate claims were cleared.`,
        },
      }
    );
    reclaimed.push({ identifier: issue.identifier, reason: decision.reason });
  }

  mkdirSync(HERMES_PATHS.stateDir, { recursive: true });
  const receipt = {
    schema: 'jovie-linear-in-progress-liveness/v1',
    observedAt: now.toISOString(),
    staleAfterMs: 5 * 60 * 1000,
    before: data.team.issues.nodes.length,
    retained,
    reclaimed,
  };
  const tmp = `${IN_PROGRESS_RECEIPT}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(receipt, null, 2)}\n`);
  renameSync(tmp, IN_PROGRESS_RECEIPT);
  logJobEvent({
    job: JOB,
    event: 'linear_in_progress_liveness_checked',
    before: receipt.before,
    retained: retained.length,
    reclaimed: reclaimed.length,
  });
}

async function refreshTriageLivenessReceipt(): Promise<void> {
  const response = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      Authorization: linearApiKey(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `query($teamId: String!) {
        team(id: $teamId) {
          issues(
            first: 100
            filter: {
              state: { name: { eq: "Triage" } }
              labels: { some: { name: { in: ["agent-ready", "ready-for-intake"] } } }
            }
          ) {
            nodes { identifier updatedAt }
            pageInfo { hasNextPage }
          }
        }
      }`,
      variables: { teamId: JOVIE_TEAM_ID },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok)
    throw new Error(`Linear triage query failed (${response.status})`);
  const payload = (await response.json()) as {
    data?: {
      team?: {
        issues?: {
          nodes?: ReadonlyArray<{ identifier: string; updatedAt: string }>;
          pageInfo?: { hasNextPage?: boolean };
        };
      };
    };
    errors?: ReadonlyArray<unknown>;
  };
  if (payload.errors?.length)
    throw new Error('Linear triage query returned errors');
  const issues = payload.data?.team?.issues;
  if (!issues || issues.pageInfo?.hasNextPage) {
    throw new Error('Linear triage query was incomplete');
  }
  const receipt = buildTriageLivenessReceipt(issues.nodes ?? []);
  mkdirSync(HERMES_PATHS.stateDir, { recursive: true });
  const tmp = `${TRIAGE_RECEIPT}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(receipt, null, 2)}\n`);
  renameSync(tmp, TRIAGE_RECEIPT);
  logJobEvent({
    job: JOB,
    event: 'triage_liveness_checked',
    status: receipt.status,
    violations: receipt.violations.map(issue => issue.identifier),
  });
}

function recordTriageLivenessFailure(error: unknown): void {
  mkdirSync(HERMES_PATHS.stateDir, { recursive: true });
  const tmp = `${TRIAGE_RECEIPT}.tmp`;
  const message = error instanceof Error ? error.message : String(error);
  writeFileSync(
    tmp,
    `${JSON.stringify(
      {
        schema: 'jovie-triage-liveness/v1',
        observedAt: new Date().toISOString(),
        status: 'blocked',
        staleAfterMs: 5 * 60 * 1000,
        violations: [],
        error: message,
      },
      null,
      2
    )}\n`
  );
  renameSync(tmp, TRIAGE_RECEIPT);
  logJobEvent({
    job: JOB,
    event: 'triage_liveness_failed',
    status: 'blocked',
    error: message,
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
    const leaseNames = existsSync(DELIVERY_LIVENESS_DIR)
      ? readdirSync(DELIVERY_LIVENESS_DIR)
      : [];
    for (const name of leaseNames) {
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
    try {
      await refreshTriageLivenessReceipt();
    } catch (error) {
      recordTriageLivenessFailure(error);
      throw error;
    }
    await refreshLinearInProgressLiveness();
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
