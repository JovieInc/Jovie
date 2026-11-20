// Pure request and publication evidence for the existing mutation producer.
import { createHash } from 'node:crypto';

export const REPO = 'JovieInc/Jovie';
const WORKFLOW = '.github/workflows/mutation-diff.yml';
export const SHA = /^[a-f0-9]{40}$/u;
export const HASH = /^[a-f0-9]{64}$/u;
const ID = /^[1-9]\d*$/u;
export const object = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
export const integer = value => Number.isSafeInteger(value) && value >= 0;
export const id = value =>
  ID.test(String(value)) && Number.isSafeInteger(Number(value))
    ? String(value)
    : null;
export const hold = reason => ({ status: 'hold', reason });
const hashText = value => createHash('sha256').update(value).digest('hex');
export const same = (left, right) => digest(left) === digest(right);
const keys = (value, expected) =>
  object(value) &&
  Object.keys(value).sort().join(',') === expected.split(',').sort().join(',');
const runtime = path =>
  typeof path === 'string' &&
  /^packages\/ui\/(?:[\w-]+\/)*[\w-]+\.tsx?$/u.test(path) &&
  !/(?:^|\/)(?:tests?|__tests__|fixtures|__fixtures__|stories)\//u.test(path);
const canonical = value => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (object(value))
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
    return JSON.stringify(value);
  throw new TypeError('Only finite JSON values have an evidence digest');
};

export const digest = value => hashText(canonical(value));

export function requestBody(request) {
  return {
    requestId: request.requestId,
    file: request.file,
    maxFiles: request.maxFiles,
    predecessor: request.predecessor,
  };
}

export function validRequest(request) {
  const pred = request?.predecessor;
  return (
    object(request) &&
    typeof request.requestId === 'string' &&
    /^[a-z0-9][a-z0-9-]{0,99}$/u.test(request.requestId) &&
    runtime(request.file) &&
    request.maxFiles === 1 &&
    object(pred) &&
    typeof pred.runId === 'string' &&
    id(pred.runId) !== null &&
    typeof pred.runAttempt === 'string' &&
    id(pred.runAttempt) !== null &&
    SHA.test(pred.sha ?? '') &&
    pred.cacheKey ===
      `mutation-sweep-portable-v2-${pred.runId}-${pred.runAttempt}` &&
    pred.artifactName === `mutation-sweep-${pred.runId}` &&
    request.requestDigest === digest(requestBody(request))
  );
}

/** The reviewed tracked index is authoritative; cache eviction never deletes intent. */
export function validateRequests(document, context) {
  const { tracked, isFile } = context ?? {};
  try {
    if (
      !keys(document, 'schema,requests') ||
      document.schema !== 'jovie.mutation-next-targets/v1' ||
      !Array.isArray(document.requests) ||
      document.requests.length > 100
    )
      return { ...hold('invalid request index'), requests: [] };
    const paths = new Set(tracked);
    const requests = new Map();
    for (const raw of document.requests) {
      if (
        !keys(raw, 'requestId,file,maxFiles,predecessor') ||
        !keys(raw.predecessor, 'runId,runAttempt,sha,cacheKey,artifactName')
      )
        return { ...hold('invalid request fields'), requests: [] };
      const predecessor = {
        ...raw.predecessor,
        runId: id(raw.predecessor.runId),
        runAttempt: id(raw.predecessor.runAttempt),
      };
      const body = { ...raw, predecessor };
      const request = { ...body, requestDigest: digest(body) };
      if (
        !validRequest(request) ||
        !paths.has(request.file) ||
        isFile?.(request.file) !== true ||
        [...paths].some(
          path =>
            path !== request.file &&
            /\.tsx?$/u.test(path) &&
            path.startsWith(request.file)
        )
      )
        return {
          ...hold('target is not an exact tracked UI runtime file'),
          requests: [],
        };
      if (
        requests.has(request.requestId) &&
        !same(requests.get(request.requestId), request)
      )
        return { ...hold('conflicting request identity'), requests: [] };
      requests.set(request.requestId, request);
    }
    return requests.size > 1
      ? { ...hold('only one distinct request is supported'), requests: [] }
      : { status: 'ready', requests: [...requests.values()] };
  } catch {
    return { ...hold('request index could not be validated'), requests: [] };
  }
}

export function runMatches(run, producer, terminal = true) {
  return (
    object(run) &&
    id(run.id) === producer.runId &&
    id(run.run_attempt) === producer.runAttempt &&
    run.repository?.full_name === REPO &&
    run.head_repository?.full_name === REPO &&
    run.path === WORKFLOW &&
    run.head_branch === 'main' &&
    run.head_sha === (producer.transportSha ?? producer.sha) &&
    ['push', 'workflow_dispatch', 'workflow_run'].includes(run.event) &&
    (!terminal ||
      (run.status === 'completed' &&
        [
          'success',
          'failure',
          'cancelled',
          'timed_out',
          'neutral',
          'skipped',
          'stale',
          'startup_failure',
          'action_required',
        ].includes(run.conclusion)))
  );
}

export function scoringJob(listing, producer) {
  if (
    !object(listing) ||
    !Array.isArray(listing.jobs) ||
    listing.jobs.length < 1 ||
    listing.jobs.length > 100 ||
    listing.total_count !== listing.jobs.length ||
    new Set(listing.jobs.map(job => job?.id)).size !== listing.jobs.length ||
    listing.jobs.some(
      job =>
        !id(job?.id) ||
        id(job.run_id) !== producer.runId ||
        id(job.run_attempt) !== producer.runAttempt ||
        job.head_sha !== (producer.transportSha ?? producer.sha)
    )
  )
    return null;
  const matches = listing.jobs.filter(
    job => job.name === 'Rolling mutation sweep'
  );
  return matches.length === 1 && Array.isArray(matches[0].steps)
    ? matches[0]
    : null;
}

export function artifactMatches(artifact, name, producer) {
  return (
    id(artifact?.id) !== null &&
    artifact.name === name &&
    artifact.expired === false &&
    id(artifact.workflow_run?.id) === producer.runId &&
    artifact.workflow_run.head_sha === (producer.transportSha ?? producer.sha)
  );
}

/** New admission/publication keeps the live-cache identity gate. */
export const verifyPublication = (request, evidence) =>
  verifyPublicationEvidence(request, evidence, true);

/** Historical completion needs durable authenticated bytes, not cache retention. */
export const verifyHistoricalPublication = (request, evidence) =>
  verifyPublicationEvidence(request, evidence, false);

/** Failure conclusions can still publish honest unknown/module-regression history. */
function verifyPublicationEvidence(request, evidence, requireLiveCache) {
  const {
    run,
    latestRun,
    jobs,
    artifact,
    receipt,
    stateText,
    historyText,
    cache,
  } = evidence ?? {};
  const pred = request?.predecessor;
  if (
    !validRequest(request) ||
    !runMatches(run, pred) ||
    !runMatches(latestRun, pred) ||
    run.conclusion !== latestRun.conclusion
  )
    return hold('predecessor identity or terminal attempt is unknown');
  const job = scoringJob(jobs, pred);
  const published = [
    'Snapshot sweep state and survivor tasks',
    'Save sweep state',
    'Upload sweep state and survivor tasks',
  ];
  if (
    !job ||
    job.status !== 'completed' ||
    published.some(name => {
      const steps = job.steps.filter(step => step?.name === name);
      return (
        steps.length !== 1 ||
        steps[0].status !== 'completed' ||
        steps[0].conclusion !== 'success'
      );
    })
  )
    return hold('exact snapshot/cache/artifact publication is incomplete');
  if (
    !artifactMatches(artifact, pred.artifactName, pred) ||
    ((requireLiveCache || cache != null) &&
      (cache?.key !== pred.cacheKey || cache?.ref !== 'refs/heads/main'))
  )
    return hold('publication artifact or main cache identity mismatch');
  if (
    receipt?.schema !== 'jovie.mutation-producer-receipt/v1' ||
    typeof receipt.runtime?.node !== 'string' ||
    !/^\d+\.\d+\.\d+$/u.test(receipt.runtime.node) ||
    !object(receipt.scope) ||
    !['ui', 'rolling'].includes(receipt.scope.kind) ||
    typeof receipt.scope.include !== 'string' ||
    !receipt.scope.include.startsWith('packages/ui/') ||
    !integer(receipt.scope.maxFiles) ||
    receipt.scope.maxFiles < 1 ||
    (pred.transportSha !== undefined &&
      (receipt.scope.kind !== 'ui' ||
        receipt.scope.include !== request.file ||
        receipt.scope.maxFiles !== 1)) ||
    receipt.sha !== pred.sha ||
    receipt.runId !== pred.runId ||
    receipt.runAttempt !== pred.runAttempt ||
    receipt.cacheKey !== pred.cacheKey ||
    typeof stateText !== 'string' ||
    receipt.stateSha256 !== hashText(stateText) ||
    (historyText != null && typeof historyText !== 'string') ||
    receipt.attemptsSha256 !==
      (historyText == null ? null : hashText(historyText))
  )
    return hold('publication receipt bytes mismatch');
  try {
    const state = JSON.parse(stateText);
    if (state?.schemaVersion !== 1 || !object(state.modules))
      return hold('published state schema mismatch');
    if (
      historyText != null &&
      historyText
        .split('\n')
        .filter(Boolean)
        .some(line => !object(JSON.parse(line)))
    )
      return hold('published history schema mismatch');
  } catch {
    return hold('published state or history is malformed');
  }
  return {
    status: 'ready',
    publication: {
      ...pred,
      artifactId: String(artifact.id),
      receiptDigest: digest(receipt),
    },
  };
}
