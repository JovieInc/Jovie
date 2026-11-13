import { createHash } from 'node:crypto';
import { ADMISSION_BLOCKING_LABELS } from './admission-hold-labels.mjs';
import {
  linkedRepairNumbers,
  readClosureEvidence,
} from './merge-queue-recovery-evidence.mjs';
import { inspectOfficialLease } from './official-symphony-lease.mjs';
import { FLEET_CLOSURE_LEASE_STALE_MS } from './ownerless-recovery-policy.mjs';

export { queueSnapshot } from './merge-queue-recovery-evidence.mjs';

export const QUEUE_ID = 'github:jovie:merge-queue-progress';
export const QUEUE_FINGERPRINT =
  'automation-liveness-github-jovie-merge-queue-progress';
export const RECOVERY_MARKER = '<!-- jovie-queue-recovery:v1 -->';
const END_MARKER = '<!-- /jovie-queue-recovery -->';
const MAX_ATTEMPTS = 3;
const held = labels =>
  labels.some(label =>
    ADMISSION_BLOCKING_LABELS.includes(String(label.name).toLowerCase())
  );
const stamp = value => Date.parse(value ?? '');
const digest = value =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function parseQueueRecovery(description) {
  const raw = String(description ?? '')
    .split(RECOVERY_MARKER)[1]
    ?.split(END_MARKER)[0];
  if (!raw) return null;
  try {
    const state = JSON.parse(raw);
    return state?.schema === 'jovie-queue-recovery/v1' &&
      Number.isInteger(state.attempts) &&
      state.attempts >= 0 &&
      Number.isFinite(stamp(state.openedAt)) &&
      Number.isFinite(stamp(state.deadline))
      ? state
      : null;
  } catch {
    return null;
  }
}
export const renderQueueRecovery = state =>
  `${RECOVERY_MARKER}\n${JSON.stringify(state)}\n${END_MARKER}`;

export async function readQueueIncident(linear) {
  if (!linear) return { known: false, issue: null };
  try {
    const data = await linear.graphql(
      `query($fingerprint:String!){issues(first:25,filter:{team:{key:{eq:"JOV"}},title:{contains:$fingerprint}}){nodes{id identifier description state{name type} labels{nodes{name}} attachments(first:50){nodes{url} pageInfo{hasNextPage}}} pageInfo{hasNextPage}}}`,
      { fingerprint: QUEUE_FINGERPRINT }
    );
    const rows = data?.issues;
    if (!Array.isArray(rows?.nodes) || rows.pageInfo?.hasNextPage !== false)
      return { known: false, issue: null };
    const active = rows.nodes.filter(
      i => !['completed', 'canceled'].includes(i.state?.type)
    );
    return { known: active.length <= 1, issue: active[0] ?? null };
  } catch {
    return { known: false, issue: null };
  }
}

/** One incident, one bounded repair handoff. Queue churn never resets attempts. */
export function planQueueRecovery({
  row,
  snapshot,
  incident,
  previous = null,
  runtime,
  nowMs,
}) {
  const durable = parseQueueRecovery(incident.issue?.description);
  const completed = previous?.recovery?.status === 'recovered';
  const prior =
    completed &&
    (!durable || stamp(durable.openedAt) <= stamp(previous.recovery.openedAt))
      ? null
      : (durable ?? previous?.recovery);
  const open = Boolean(
    incident.issue ||
      (prior && prior.status !== 'recovered') ||
      previous === 'red'
  );
  const state = {
    schema: 'jovie-queue-recovery/v1',
    openedAt: new Date(nowMs).toISOString(),
    attempts: 0,
    baselineMergeAt: snapshot?.lastMergeAt ?? null,
    repair: null,
    ...prior,
    observedAt: new Date(nowMs).toISOString(),
    owner: null,
    lease: null,
    nextAction: 'refresh-telemetry',
    deadline:
      prior?.deadline ??
      new Date(nowMs + row.budgetMinutes * 60_000).toISOString(),
  };
  const finish = (status, nextAction, extra = {}) => ({
    state: { ...state, status, nextAction, ...extra },
    dispatch: false,
    close: false,
  });
  if (
    !incident.known ||
    (String(incident.issue?.description ?? '').includes(RECOVERY_MARKER) &&
      !durable)
  )
    return {
      ...finish('unknown', 'refresh-authoritative-incident'),
      writable: false,
    };
  if (
    !snapshot?.known ||
    nowMs - stamp(snapshot.observedAt) >= FLEET_CLOSURE_LEASE_STALE_MS ||
    nowMs < stamp(snapshot.observedAt)
  )
    return finish('unknown', 'refresh-telemetry');
  if (!open && row.status === 'fresh')
    return { state: null, dispatch: false, close: false };
  if (!prior && open) {
    // Migrating an already-open incident establishes a conservative baseline;
    // ancient issue.createdAt and re-enqueue timestamps are not episode starts.
    state.baselineMergeAt = snapshot.lastMergeAt;
  }
  state.failure = snapshot.failures.length
    ? {
        fingerprint: digest(snapshot.failures),
        evidence: snapshot.failures,
      }
    : (prior?.failure ?? {
        fingerprint: null,
        evidence: [],
        reason: 'failure-not-yet-observed',
      });
  const issue = incident.issue;
  const links = issue?.attachments;
  if (links?.pageInfo?.hasNextPage === true)
    return finish('unknown', 'read-complete-repair-links');
  if (snapshot.repairLinksKnown === false)
    return finish('unknown', 'refresh-linked-repair');
  const numbers = new Set(linkedRepairNumbers(issue, prior?.repair));
  const allPrs = [
    ...snapshot.open,
    ...snapshot.merged,
    ...(snapshot.linkedRepairs ?? []),
  ];
  const candidates = allPrs.filter(
    p =>
      numbers.has(p.number) &&
      (p.number === prior?.repair?.pr ||
        !p.mergedAt ||
        stamp(p.mergedAt) > stamp(state.openedAt))
  );
  const repairs = [...new Map(candidates.map(p => [p.number, p])).values()];
  if (repairs.length > 1)
    return finish('escalated', 'reconcile-competing-repair-prs');
  const repair = repairs[0];
  if (repair)
    state.repair = {
      pr: repair.number,
      head: repair.headRefOid,
      mergedAt: repair.mergedAt ?? null,
    };
  else if (state.repair) return finish('unknown', 'refresh-linked-repair');
  const progressed =
    repair &&
    prior?.repair?.pr === repair.number &&
    prior.repair.head === repair.headRefOid &&
    stamp(repair.mergedAt) > stamp(state.openedAt) &&
    stamp(repair.mergedAt) > (stamp(state.baselineMergeAt) || 0) &&
    snapshot.closure?.proven === true &&
    snapshot.closure.repairSha === repair.mergeCommit?.oid &&
    snapshot.closure.mainSha === snapshot.main?.oid &&
    snapshot.main.history?.nodes?.some(c => c.oid === repair.mergeCommit.oid);
  if (progressed)
    return {
      ...finish('recovered', 'verified-merge-progress', {
        closure: snapshot.closure,
      }),
      close: true,
    };
  if (
    (repair && (repair.isDraft || held(repair.labels.nodes))) ||
    held(issue?.labels?.nodes ?? [])
  )
    return finish('held', 'respect-existing-hold');
  if (repair?.mergedAt)
    return finish(
      stamp(state.deadline) <= nowMs ? 'escalated' : 'verifying',
      stamp(state.deadline) <= nowMs
        ? 'main-and-queue-proof-deadline-exceeded'
        : 'verify-main-and-queue-evidence'
    );
  const worker = inspectOfficialLease(runtime, issue?.identifier, {
    nowMs,
    staleAfterMs: FLEET_CLOSURE_LEASE_STALE_MS,
    requireHeartbeat: true,
  });
  if (!worker.known)
    return finish(
      stamp(state.deadline) <= nowMs ? 'escalated' : 'unknown',
      stamp(state.deadline) <= nowMs
        ? 'restore-official-worker-telemetry'
        : worker.reason
    );
  const failedRepair =
    repair?.state === 'CLOSED' ||
    repair?.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state === 'FAILURE';
  if (worker.accepted && prior?.deadline && stamp(prior.deadline) <= nowMs)
    return finish('escalated', 'accepted-worker-missed-repair-deadline', {
      owner: worker.owner,
      lease: worker.lease,
      deadline: prior.deadline,
    });
  if (worker.accepted)
    return finish(
      failedRepair ? 'repair-failed' : 'owned',
      failedRepair
        ? 'repair-current-head'
        : repair
          ? 'await-repair-checks-and-native-merge'
          : 'link-repair-pr',
      {
        owner: worker.owner,
        lease: worker.lease,
        leaseExpiresAt: worker.expiresAt,
        deadline: prior?.deadline ?? state.deadline,
      }
    );
  if (state.attempts >= MAX_ATTEMPTS)
    return finish('escalated', 'dispatcher-retry-budget-exhausted');
  if (
    prior?.deadline &&
    stamp(prior.deadline) > nowMs &&
    ['dispatching', 'queued'].includes(prior.status)
  )
    return finish('queued', 'await-dispatcher-acceptance', {
      deadline: prior.deadline,
    });
  if (!issue?.identifier) return finish('unowned', 'file-canonical-incident');
  state.attempts += 1;
  state.deadline = new Date(nowMs + row.budgetMinutes * 60_000).toISOString();
  return {
    ...finish('dispatching', 'reattach-remediation-lane'),
    dispatch: true,
  };
}

export async function prepareQueueRecovery({
  report,
  observations,
  previous,
  linear,
  env,
  fetchImpl,
  readIncident = readQueueIncident,
  readRuntime = null,
  readClosure = readClosureEvidence,
}) {
  const row = report.results.find(r => r.id === QUEUE_ID);
  if (!row) return null;
  const incident = await readIncident(linear);
  const { fetchOfficialSymphonyState } = await import(
    '../ownerless-recovery-sweeper.mjs'
  );
  const readState =
    readRuntime ??
    (() =>
      env.SYMPHONY_STATE_URL
        ? fetchOfficialSymphonyState({
            url: env.SYMPHONY_STATE_URL,
            fetchImpl,
            attempts: 1,
          })
        : Promise.resolve(null));
  const runtime = incident.issue ? await readState() : null;
  const snapshot = observations.get(QUEUE_ID)?.recoverySnapshot;
  const prior =
    parseQueueRecovery(incident.issue?.description) ??
    previous[QUEUE_FINGERPRINT]?.recovery;
  const numbers = linkedRepairNumbers(incident.issue, prior?.repair);
  if (snapshot?.known && numbers.length)
    await readClosure({
      snapshot,
      repair: prior?.repair,
      numbers,
      openedAt: prior?.openedAt,
      token: env.GH_TOKEN ?? env.GITHUB_TOKEN,
      fetchImpl,
    });
  if (snapshot?.known && snapshot.queued === 0 && snapshot.eligible.length) {
    const enqueue = report.results.find(
      r => r.id === 'github:jovie:green-to-enqueue'
    );
    row.status = enqueue?.status ?? 'unknown';
  }
  const plan = planQueueRecovery({
    row,
    snapshot,
    incident,
    previous: previous[QUEUE_FINGERPRINT],
    runtime,
    nowMs: stamp(report.observedAt),
  });
  if (plan.state) {
    row.recovery = plan.state;
    row.recoveryWritable = plan.writable !== false;
    row.status = plan.close ? 'fresh' : 'stale';
    row.reason = `queue-recovery:${plan.state.status};next=${plan.state.nextAction};deadline=${plan.state.deadline}`;
    const red = report.results.filter(
      r => !['fresh', 'deferred'].includes(r.status)
    );
    report.status = red.some(r => r.critical)
      ? 'critical'
      : red.length
        ? 'degraded'
        : 'healthy';
  }
  return { ...plan, issue: incident.issue?.identifier, readState };
}

export async function dispatchQueueRecovery(plan, dependencies = {}) {
  const { processFleetClosureRemediationIntents } = await import(
    '../ownerless-recovery-sweeper.mjs'
  );
  const client =
    dependencies.clientImpl ??
    (await import('../backlog-orchestrator/linear-client.mjs'));
  if (dependencies.filed && dependencies.filed.identifier !== plan.issue)
    return { ok: false, reason: 'recovery-incident-changed' };
  try {
    const issue = await client.fetchIssue(plan.issue);
    const stored = parseQueueRecovery(issue?.description);
    if (
      issue?.identifier !== plan.issue ||
      !stored ||
      digest(stored) !== digest(plan.state)
    )
      return { ok: false, reason: 'recovery-attempt-readback-missing' };
  } catch {
    return { ok: false, reason: 'recovery-attempt-readback-failed' };
  }
  // The caller first persists this attempt through the canonical intake. A
  // crash after dispatch cannot erase the charged attempt or create a new loop.
  return processFleetClosureRemediationIntents(
    {
      remediationIntents: [
        {
          pr: plan.state.repair?.pr ?? null,
          head: plan.state.repair?.head ?? null,
          issue: plan.issue,
          reason: 'stalled-shipping-recovery',
          displayCategory: 'remediating',
          action: 'reattach-remediation-lane',
          consumer: 'symphony-linear-writer',
          recovery: {
            openedAt: plan.state.openedAt,
            attempt: plan.state.attempts,
            failure: plan.state.failure,
            nextAction: plan.state.nextAction,
            deadline: plan.state.deadline,
          },
        },
      ],
    },
    { fetchOfficialSymphonyStateImpl: plan.readState, ...dependencies }
  );
}
