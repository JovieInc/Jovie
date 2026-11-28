const SCHEMA = 'jovie.workflow-outcome-proof/v1';
const JOB_ID = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;
const RED_MARKER = /<!-- workflow-outcome-red:(\d+):(\d+):([0-9a-f]{40}) -->/;
const CONCLUSIONS = new Set(['success', 'failure', 'cancelled', 'skipped']);

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * @param {{ id?: string | number, number?: string | number, attempt?: string | number, sha?: string }} identity
 */
function runIdentity({ id, number, attempt, sha } = {}) {
  if (
    !/^[1-9][0-9]*$/.test(String(id ?? '')) ||
    !Number.isSafeInteger(Number(number)) ||
    Number(number) < 1 ||
    !Number.isSafeInteger(Number(attempt)) ||
    Number(attempt) < 1 ||
    !/^[0-9a-f]{40}$/.test(sha ?? '')
  )
    return null;
  return {
    id: String(id),
    number: Number(number),
    attempt: Number(attempt),
    sha,
  };
}

function isNewer(run, previous) {
  return (
    run.number > previous.number ||
    (run.number === previous.number &&
      run.id === previous.id &&
      run.sha === previous.sha &&
      run.attempt > previous.attempt)
  );
}

function observation({ results, conclusion, job }) {
  if (results === '') {
    return JOB_ID.test(job) && CONCLUSIONS.has(conclusion)
      ? [[job, conclusion]]
      : [];
  }
  const result = parse(results);
  if (!object(result)) return [];
  const entries = Object.entries(result);
  if (
    !entries.every(
      ([id, value]) => JOB_ID.test(id) && CONCLUSIONS.has(value?.result)
    )
  ) {
    return [];
  }
  return entries.map(([id, { result, outputs }]) => [
    id,
    result === 'success' &&
    Object.hasOwn(outputs ?? {}, 'remediation_qualified') &&
    outputs.remediation_qualified !== 'true'
      ? 'skipped'
      : result,
  ]);
}

function readState(text, source) {
  const state = parse(text);
  if (!text || text === 'green' || text === 'red') {
    return {
      previous: text || '',
      unknown: text === 'red',
      unresolved: new Map(),
      verified: new Map(),
      successful: new Map(),
      latest: null,
      lastRed: null,
    };
  }
  const map = (value, isReceipt) =>
    object(value) &&
    Object.entries(value).every(
      ([id, receipt]) => JOB_ID.test(id) && isReceipt(receipt)
    );
  if (
    state?.schema !== SCHEMA ||
    state.source !== source ||
    !['red', 'green'].includes(state.status) ||
    typeof state.unknown !== 'boolean' ||
    (state.latest !== null &&
      (!object(state.latest) || !runIdentity(state.latest))) ||
    (state.lastRed !== null &&
      (!object(state.lastRed) || !runIdentity(state.lastRed))) ||
    !map(
      state.unresolved,
      receipt => object(receipt) && runIdentity(receipt)
    ) ||
    (state.successful !== undefined &&
      !map(
        state.successful,
        receipt => object(receipt) && runIdentity(receipt)
      )) ||
    !map(
      state.verified,
      receipt =>
        object(receipt) &&
        runIdentity(receipt.failure ?? {}) &&
        runIdentity(receipt.success ?? {}) &&
        isNewer(receipt.success, receipt.failure)
    )
  )
    return {
      previous: 'red',
      unknown: true,
      unresolved: new Map(),
      verified: new Map(),
      successful: new Map(),
      latest: null,
      lastRed: null,
    };
  return {
    previous: state.status,
    unknown: state.unknown,
    unresolved: new Map(Object.entries(state.unresolved)),
    verified: new Map(Object.entries(state.verified)),
    successful: new Map(Object.entries(state.successful ?? {})),
    latest: state.latest,
    lastRed: state.lastRed,
  };
}

/** Compare the current GitHub evidence with the failed jobs for this workflow. */
export function workflowOutcomeProof({
  cached,
  source,
  results = '',
  conclusion,
  job = '',
  identity,
}) {
  const {
    previous,
    unresolved,
    verified,
    successful,
    latest,
    lastRed,
    unknown,
  } = readState(cached, source);
  const run = runIdentity(identity);
  const jobs = observation({ results, conclusion, job });
  const newerRun = run && (!latest || isNewer(run, latest));
  const outcome = (action, reason, state, proof) => ({
    action,
    reason,
    previous,
    state,
    proof,
    lastRed,
  });
  const snapshot = (status, hasUnknown, redRun = lastRed) => ({
    schema: SCHEMA,
    source,
    status,
    unknown: hasUnknown,
    latest: newerRun ? run : latest,
    lastRed: redRun,
    unresolved: Object.fromEntries(unresolved),
    verified: Object.fromEntries(verified),
    successful: Object.fromEntries(successful),
  });

  if (conclusion !== 'success' && conclusion !== 'failure') {
    return outcome('hold', 'workflow_attempt_not_complete');
  }
  if (
    conclusion === 'failure' &&
    (!run || !jobs.some(([, result]) => result === 'failure'))
  ) {
    if (run && !newerRun) return outcome('hold', 'stale_workflow_attempt');
    return outcome('red', undefined, snapshot('red', true, run));
  }
  if (!run || jobs.length === 0) {
    return outcome('hold', 'workflow_evidence_missing');
  }

  let newFailure = false;
  let newSuccess = false;
  for (const [id, result] of jobs) {
    const failure = unresolved.get(id);
    const pass = successful.get(id) ?? verified.get(id)?.success;
    if (result === 'failure') {
      if ((failure && !isNewer(run, failure)) || (pass && !isNewer(run, pass)))
        continue;
      unresolved.set(id, run);
      verified.delete(id);
      newFailure = true;
    } else if (result === 'success' && (!pass || isNewer(run, pass))) {
      successful.set(id, run);
      newSuccess = true;
      if (failure && isNewer(run, failure)) {
        verified.set(id, { failure, success: run });
        unresolved.delete(id);
      }
    }
  }
  if (conclusion === 'failure') {
    return newFailure
      ? outcome('red', undefined, snapshot('red', unknown, run))
      : outcome(
          'hold',
          'stale_workflow_attempt',
          newSuccess && snapshot(previous === 'red' ? 'red' : 'green', unknown)
        );
  }
  const success = jobs.some(([, result]) => result === 'success');
  if (!success) return outcome('hold', 'workflow_probes_did_not_run');
  if (unknown) {
    return outcome(
      'hold',
      'original_failed_probes_unknown',
      snapshot('red', true)
    );
  }
  if (unresolved.size > 0) {
    return outcome(
      'hold',
      `failed_workflow_probes_pending:${[...unresolved.keys()].sort().join(',')}`,
      snapshot('red', unknown)
    );
  }
  const proof = [...verified.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([id, { success: pass }]) =>
        `- ${id}: run ${pass.id}, attempt ${pass.attempt}, workflow SHA ${pass.sha}`
    )
    .join('\n');
  return outcome('green', undefined, snapshot('green', false), proof);
}

export function workflowRedBinding(run) {
  return run
    ? `<!-- workflow-outcome-red:${run.id}:${run.attempt}:${run.sha} -->`
    : '';
}

export function matchesWorkflowRedBinding(description, expected) {
  const observed = String(description ?? '').match(RED_MARKER)?.[0] ?? '';
  return Boolean(expected && observed === expected);
}

/** An existing or unacknowledged incident may predate a missing local cache. */
export function acknowledgedWorkflowScope(proof, result) {
  const state = proof?.state;
  if (
    state?.status === 'red' &&
    proof.previous !== 'red' &&
    !(result?.ok && (result.action === 'created' || result.reopened === true))
  ) {
    return { ...state, unknown: true };
  }
  return state;
}
