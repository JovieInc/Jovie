// JOV-13053 / JOV-7589: shared by promotion, roster enrollment and victim rearm.
// Inputs are trusted, completely paginated observations, never PR-authored claims.
export const RETRY_CONTEXT = 'mq-retry/v1';
export const SHA = /^[a-f0-9]{40}$/;

export function parseQueueBranch(branch) {
  const match = /^gh-readonly-queue\/main\/pr-([1-9]\d*)-([a-f0-9]{40})$/.exec(
    branch ?? ''
  );
  const pr = Number(match?.[1]);
  return match && Number.isSafeInteger(pr) ? { pr, head: match[2] } : null;
}

export function retryDisposition({
  head,
  labels = [],
  receipts = [],
  runs = [],
  retries = 0,
  complete = false,
  circuitOpen = false,
  removed = false,
  manual = false,
  released = false,
  cascade = false,
  cascadeRun,
} = {}) {
  const decision = (allow, reason, retry = false) => ({ allow, reason, retry });
  if (circuitOpen) return decision(false, 'circuit-open');
  if (
    !SHA.test(head ?? '') ||
    !complete ||
    !Number.isSafeInteger(retries) ||
    retries < 0
  ) {
    return decision(false, 'head-unchanged-non-infra');
  }
  if (manual && !released) return decision(false, 'manual-release-required');
  // Positive victim attribution may identify this group's failure as another
  // PR's. It releases that run only, never an older failure of this source head.
  const victimRun = id =>
    cascade && Number.isSafeInteger(cascadeRun) && id === cascadeRun;
  const own = receipts.filter(
    r => r.head === head && r.schema === 'ejection/v1' && !victimRun(r.run)
  );
  const failed = runs.filter(
    r =>
      parseQueueBranch(r.head_branch)?.head === head &&
      !victimRun(r.id) &&
      [
        'failure',
        'timed_out',
        'cancelled',
        'action_required',
        'startup_failure',
      ].includes(r.conclusion)
  );
  // A receipt can race the label write; the run can race the classifier. Neither
  // an absent label nor a lone infra label grants a retry.
  const classes = new Set(own.map(r => r.class));
  if (classes.has('systemic')) return decision(false, 'circuit-open');
  // Labels persist across pushes, so they constrain only a matching head-bound
  // receipt. A code label from yesterday cannot poison today's infra receipt.
  const labeled = own.filter(r => labels.includes(`mq-ejected:${r.class}`));
  if (
    ['code', 'size', 'conflict'].some(
      c => classes.has(c) || labeled.some(r => r.class === c)
    )
  ) {
    return decision(false, 'head-unchanged-non-infra');
  }
  const recordedRuns = new Set(own.map(r => r.run));
  if (
    failed.some(
      r => !recordedRuns.has(r.id) && !(cascade && r.conclusion === 'cancelled')
    )
  ) {
    return decision(false, 'head-unchanged-non-infra');
  }
  if (classes.has('infra') || classes.has('contract')) {
    // Count distinct failed attempts as well as reservations, surviving races
    // between classifier, enroll and rearm. One retry means no third flight.
    const failures = new Set(own.map(r => `${r.run}:${r.attempt ?? 1}`)).size;
    if (retries >= 1 || failures >= 2)
      return decision(false, 'infra-retry-exhausted');
    return decision(true, 'infra-retry', true);
  }
  if (manual && released && !classes.size && !failed.length)
    return decision(true, 'manual-release');
  if (cascade && !classes.size) return decision(true, 'cascade-rearm');
  if (removed || failed.length || own.length) {
    return decision(false, 'head-unchanged-non-infra');
  }
  return decision(true, 'new-head');
}

export function trustedRetryCount(statuses) {
  return new Set(
    statuses
      .filter(
        s =>
          s.context === RETRY_CONTEXT &&
          s.state === 'success' &&
          s.creator?.type === 'Bot' &&
          /^(?:jovie-(?:bot|ci-lane|symphony-lane|agents-lane)|github-actions)\[bot\]$/.test(
            s.creator.login
          ) &&
          /^spent:run=\d+;try=\d+$/.test(s.description ?? '')
      )
      .map(s => s.description)
  ).size;
}
