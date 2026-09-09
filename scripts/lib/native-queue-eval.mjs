import { groupEvidenceFailures } from './native-queue-group-evidence.mjs';
import {
  checkFailures,
  digest,
  disposition,
  requiredNames,
  SCHEMA,
  schedulerDeadline,
  sha,
  time,
} from './native-queue-policy-evidence.mjs';

export { groupEvidenceFailures } from './native-queue-group-evidence.mjs';
export {
  checkFailures,
  digest,
  disposition,
  SCHEMA,
  schedulerDeadline,
} from './native-queue-policy-evidence.mjs';

export function evaluate(bundle, now = Date.now()) {
  const failures = [],
    blocked = [];
  const require = (condition, reason) => {
    if (!condition) blocked.push(reason);
  };
  if (
    !bundle ||
    bundle.schema !== SCHEMA ||
    bundle.repository !== 'JovieInc/Jovie'
  ) {
    return {
      status: 'BLOCKED',
      failures,
      blocked: ['invalid-envelope'],
      inventory: [],
    };
  }
  const snapshots = bundle.snapshots ?? [];
  require(snapshots.length >= 3, 'three-fresh-inventories-required');
  const latest = snapshots.at(-1);
  require(latest &&
    time(latest.startedAt) &&
    time(latest.finishedAt) &&
    now - Date.parse(latest.startedAt) <= 5 * 60_000 &&
    now >= Date.parse(latest.finishedAt), 'stale-or-future-inventory');
  require(time(bundle.startedAt) &&
    Date.parse(bundle.startedAt) <= now, 'invalid-cohort-start');
  require(new Set(snapshots.map(s => s.startedAt)).size ===
    snapshots.length, 'replayed-inventory');
  const cycles = new Map();
  const inventory = [];
  const admissions = new Map();
  for (const s of snapshots) {
    require(time(s.startedAt) &&
      time(s.finishedAt) &&
      Date.parse(bundle.startedAt) <= Date.parse(s.startedAt) &&
      Date.parse(s.startedAt) <= Date.parse(s.finishedAt) &&
      Date.parse(s.finishedAt) <= now, 'inventory-chronology');
    require(s.errors?.length === 0, `api-error:${s.startedAt}`);
    require(s.repository === bundle.repository &&
      sha(s.main) &&
      sha(s.policySha) &&
      s.policyDigest === digest(s.policy), 'policy-revision-binding');
    require(s.complete === true &&
      Array.isArray(s.prs) &&
      new Set(s.prs.map(p => p.number)).size ===
        s.prs.length, 'incomplete-inventory');
    const p = s.policy;
    if (!p?.required || !p.review || !p.queue) {
      blocked.push('policy-unavailable');
      continue;
    }
    require(requiredNames.every(n => p.required.some(r => r.context === n)) &&
      p.queue.grouping_strategy === 'ALLGREEN' &&
      p.bypassActors?.length === 0 &&
      p.classicProtection === null &&
      p.enforcement === 'active', 'native-policy-incomplete-or-bypass');
    const deadline =
      schedulerDeadline(s.scheduler, s.policySha) ??
      schedulerDeadline(bundle.policySources?.[s.policySha], s.policySha);
    require(deadline !== null, 'scheduler-evidence-unavailable');
    for (const run of s.cycles ?? []) {
      if (
        run.repository?.full_name !== bundle.repository ||
        run.path !== '.github/workflows/merge-queue-autoenroll.yml'
      ) {
        blocked.push('controller-repository-or-path-mismatch');
        continue;
      }
      if (
        run.status === 'completed' &&
        run.conclusion === 'success' &&
        Date.parse(run.created_at) >= Date.parse(bundle.startedAt) &&
        Date.parse(run.updated_at) <= Date.parse(s.finishedAt)
      )
        cycles.set(run.id, run);
      if (
        run.conclusion === 'failure' &&
        Date.parse(run.created_at) >= Date.parse(bundle.startedAt)
      )
        failures.push(`controller-failure:${run.id}`);
    }
    for (const pr of s.prs ?? []) {
      const d = disposition(pr, p);
      if (s === latest) inventory.push(d);
      const key = `${pr.number}:${pr.headRefOid}`;
      if (d.type === 'ADMITTED') {
        const entry = pr.mergeQueueEntry;
        const previous = admissions.get(key);
        if (previous && previous.pr.mergeQueueEntry.id !== entry.id)
          failures.push(`queue-churn:${key}`);
        admissions.set(key, { pr, snapshot: s });
      }
      if (d.type === 'ELIGIBLE') {
        const admittedLater = snapshots.some(
          l =>
            Date.parse(l.finishedAt) >= Date.parse(s.finishedAt) &&
            l.prs?.some(
              q =>
                q.number === pr.number &&
                q.headRefOid === pr.headRefOid &&
                q.isInMergeQueue &&
                time(q.mergeQueueEntry?.enqueuedAt)
            )
        );
        if (!admittedLater) require(false, `unadmitted-eligible:${key}`);
        else if (deadline === null)
          require(false, `admission-deadline-unproved:${key}`);
        else {
          const admission = snapshots
            .flatMap(l => l.prs ?? [])
            .find(
              q =>
                q.number === pr.number &&
                q.headRefOid === pr.headRefOid &&
                q.isInMergeQueue
            );
          require(Date.parse(admission.mergeQueueEntry.enqueuedAt) -
            Date.parse(s.startedAt) <=
            deadline, `admission-deadline-exceeded:${key}`);
        }
      }
    }
  }
  require(cycles.size >= 3, 'three-successful-controller-cycles-required');
  require(new Set(
    snapshots
      .map(
        s =>
          s.cycles?.find(
            r => r.status === 'completed' && r.conclusion === 'success'
          )?.id
      )
      .filter(Boolean)
  ).size >= 3, 'inventories-must-span-distinct-controller-cycles');
  const proven = [];
  for (const m of bundle.merges ?? []) {
    const a = admissions.get(`${m.number}:${m.head}`);
    if (!a) {
      blocked.push(`prior-positioned-admission-missing:${m.number}`);
      continue;
    }
    const { pr, snapshot: s } = a;
    const errors = [];
    const check = (ok, reason) => {
      if (!ok) errors.push(`${m.number}:${reason}`);
    };
    const events = m.timeline?.nodes;
    const added = events?.find(
      e =>
        e.__typename === 'AddedToMergeQueueEvent' &&
        e.createdAt === pr.mergeQueueEntry.enqueuedAt
    );
    const merged = events?.find(
      e => e.__typename === 'MergedEvent' && e.commit?.oid === m.commit
    );
    const between =
      events?.filter(
        e =>
          Date.parse(e.createdAt) > Date.parse(added?.createdAt) &&
          Date.parse(e.createdAt) < Date.parse(merged?.createdAt)
      ) ?? [];
    check(
      time(m.observedAt) &&
        time(added?.createdAt) &&
        time(merged?.createdAt) &&
        Date.parse(added.createdAt) <= Date.parse(merged.createdAt) &&
        Date.parse(s.startedAt) < Date.parse(merged.createdAt) &&
        Date.parse(merged.createdAt) <= Date.parse(m.observedAt) &&
        Date.parse(m.observedAt) <= now,
      'merge-chronology'
    );
    check(
      m.repository === bundle.repository &&
        m.policyDigest === s.policyDigest &&
        m.head === pr.headRefOid,
      'receipt-binding'
    );
    check(
      disposition(pr, s.policy).reasons.every(
        reason => reason === 'mergeable:UNKNOWN'
      ) &&
        checkFailures(
          pr.checks,
          s.policy.required,
          m.head,
          Date.parse(pr.mergeQueueEntry.enqueuedAt)
        ).length === 0,
      'source-policy-at-admission'
    );
    check(
      (m.timeline?.pageInfo?.hasPreviousPage === false ||
        Date.parse(events?.[0]?.createdAt) < Date.parse(added?.createdAt)) &&
        added?.actor?.login === 'jovie-bot' &&
        added?.enqueuer?.login === 'jovie-bot[bot]' &&
        merged?.mergeRefName === 'main' &&
        merged?.actor?.login === 'jovie-bot',
      'native-events'
    );
    check(
      !between.some(
        e =>
          e.__typename === 'RemovedFromMergeQueueEvent' &&
          !(
            e.reason === 'merged' &&
            e.actor?.login === 'github-merge-queue' &&
            e.enqueuer?.login === 'github-merge-queue[bot]' &&
            e.beforeCommit?.oid === m.commit
          )
      ),
      'dequeue-before-merge'
    );
    check(
      sha(m.groupHead) &&
        sha(m.groupBase) &&
        m.groupHead === pr.mergeQueueEntry.headCommit?.oid &&
        m.groupBase === pr.mergeQueueEntry.baseCommit?.oid &&
        m.commit === m.groupHead,
      'exact-merge-group'
    );
    check(
      m.run?.event === 'merge_group' &&
        m.run.status === 'completed' &&
        m.run.head_sha === m.groupHead &&
        m.run.repository?.full_name === bundle.repository &&
        m.run.path === '.github/workflows/ci.yml' &&
        m.run.conclusion === 'success',
      'merge-group-ci'
    );
    errors.push(
      ...checkFailures(
        m.checks,
        s.policy.required,
        m.groupHead,
        Date.parse(merged?.createdAt)
      ).map(e => `${m.number}:${e}`)
    );
    check(
      m.compare?.base_commit?.sha === m.commit &&
        m.compare.merge_base_commit?.sha === m.commit &&
        ['ahead', 'identical'].includes(m.compare.status) &&
        sha(m.main),
      'main-reachability'
    );
    errors.push(...groupEvidenceFailures(m).map(e => `${m.number}:${e}`));
    if (errors.length) blocked.push(...errors);
    else proven.push(m.number);
  }
  require(new Set(proven).size >= 2, 'two-distinct-native-merges-required');
  const provenMerges = (bundle.merges ?? []).filter(m =>
    proven.includes(m.number)
  );
  require(new Set(provenMerges.map(m => m.commit)).size >=
    2, 'distinct-merged-commits-required');
  require(provenMerges.some(first =>
    provenMerges.some(
      second =>
        first.number !== second.number && second.groupBase === first.commit
    )
  ), 'consecutive-native-merges-required');
  if (
    snapshots.some(s =>
      s.prs?.some(
        p =>
          p.number === 16237 && disposition(p, s.policy).type !== 'INELIGIBLE'
      )
    )
  )
    require(proven.includes(16237), 'eligible-16237-merge-required');
  const v = bundle.validation;
  require(sha(bundle.evaluatorSha) &&
    v?.run?.repository?.full_name === bundle.repository &&
    v.run.head_sha === bundle.evaluatorSha &&
    v.run.path === '.github/workflows/ci.yml' &&
    v.run.status === 'completed' &&
    v.run.conclusion === 'success' &&
    v.job?.run_id === v.run.id &&
    v.job?.run_attempt === v.run.run_attempt &&
    v.job?.head_sha === bundle.evaluatorSha &&
    v.job?.name === 'ci-fast (remaining)' &&
    v.job?.status === 'completed' &&
    v.job?.conclusion === 'success' &&
    time(v.job?.completed_at) &&
    Date.parse(v.job.completed_at) <= now &&
    v.job.steps?.some(
      step =>
        step.name === 'Run structural ci-fast lane' &&
        step.status === 'completed' &&
        step.conclusion === 'success'
    ) &&
    typeof v.log === 'string' &&
    v.log.includes('lib/__tests__/native-queue-eval.test.mjs') &&
    v.log.includes('--coverage.include=lib/native-queue-eval.mjs') &&
    /Test Files\s+\d+ passed/.test(v.log) &&
    /Lines\s+:\s+[\d.]+%/.test(v.log) &&
    !/ERROR: Coverage|Test Files.*failed|FAIL\s+\|workspace-scripts\|/.test(
      v.log
    ), 'authoritative-evaluator-ci-tests-and-coverage-required');
  return {
    status: failures.length ? 'FAIL' : blocked.length ? 'BLOCKED' : 'PASS',
    failures: [...new Set(failures)],
    blocked: [...new Set(blocked)],
    proven,
    cycles: [...cycles.keys()],
    inventory,
  };
}
