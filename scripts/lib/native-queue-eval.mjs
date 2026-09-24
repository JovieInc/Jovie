import { stripVTControlCharacters } from 'node:util';
import { groupEvidenceFailures } from './native-queue-group-evidence.mjs';
import {
  checkFailures,
  digest,
  disposition,
  requiredNames,
  SCHEMA,
  sha,
  time,
} from './native-queue-policy-evidence.mjs';

export { groupEvidenceFailures } from './native-queue-group-evidence.mjs';
export {
  checkFailures,
  digest,
  disposition,
  SCHEMA,
} from './native-queue-policy-evidence.mjs';

export const inventoryIdentity = prs =>
  digest(
    prs
      .map(p =>
        [
          p.number,
          p.headRefOid,
          p.isInMergeQueue,
          p.mergeQueueEntry?.id,
          p.mergeQueueEntry?.headCommit?.oid,
          p.mergeQueueEntry?.baseCommit?.oid,
        ].join(':')
      )
      .sort()
  );

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
    require(Array.isArray(s.prs) &&
      Array.isArray(s.readback) &&
      time(s.readbackAt) &&
      Date.parse(s.readbackAt) >= Date.parse(s.startedAt) &&
      Date.parse(s.readbackAt) <= Date.parse(s.finishedAt) &&
      inventoryIdentity(s.prs) ===
        inventoryIdentity(s.readback), 'inventory-readback-unproved');
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
      }
    }
  }
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
    const native = m.nativeMerge;
    const entry = pr.mergeQueueEntry;
    check(
      time(m.observedAt) &&
        time(entry.enqueuedAt) &&
        time(native?.merged_at) &&
        Date.parse(entry.enqueuedAt) <= Date.parse(native.merged_at) &&
        Date.parse(s.startedAt) < Date.parse(native.merged_at) &&
        Date.parse(native.merged_at) <= Date.parse(m.observedAt) &&
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
      m.entryId === entry.id &&
        ['User', 'Bot'].includes(entry.enqueuer?.__typename) &&
        typeof entry.enqueuer?.login === 'string' &&
        entry.enqueuer.login.length > 0 &&
        native?.number === m.number &&
        native.merged === true &&
        native.state === 'closed' &&
        native.head?.sha === m.head &&
        native.merge_commit_sha === m.commit &&
        native.base?.ref === 'main' &&
        native.base.repo?.full_name === bundle.repository &&
        ['User', 'Bot'].includes(native.merged_by?.type) &&
        typeof native.merged_by?.login === 'string' &&
        native.merged_by.login.length > 0,
      'native-admission-and-merge'
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
        Date.parse(native?.merged_at)
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
  const v = bundle.validation;
  const log = typeof v?.log === 'string' ? stripVTControlCharacters(v.log) : '';
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
    log.includes('lib/__tests__/native-queue-eval.test.mjs') &&
    log.includes('--coverage.include=lib/native-queue-eval.mjs') &&
    /Test Files\s+\d+ passed/.test(log) &&
    (/Lines\s+:\s+[\d.]+%/.test(log) ||
      (log.includes('% Coverage report from v8') &&
        /File\s*\| % Stmts \| % Branch \| % Funcs \| % Lines/.test(log) &&
        /All files\s*\|(?:\s*\d+(?:\.\d+)?\s*\|){4}/.test(log))) &&
    !/ERROR: Coverage|Test Files.*failed|FAIL\s+\|workspace-scripts\|/.test(
      log
    ), 'authoritative-evaluator-ci-tests-and-coverage-required');
  return {
    status: failures.length ? 'FAIL' : blocked.length ? 'BLOCKED' : 'PASS',
    failures: [...new Set(failures)],
    blocked: [...new Set(blocked)],
    proven,
    inventories: snapshots.length,
    inventory,
  };
}
