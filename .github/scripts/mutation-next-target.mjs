// Pure claim, measurement and replay decisions for the existing mutation producer.
import { MIN_RATCHET_VALID } from '../../scripts/lib/mutation-sweep.mjs';
import {
  artifactMatches,
  digest,
  HASH,
  hold,
  id,
  integer,
  object,
  REPO,
  requestBody,
  runMatches,
  SHA,
  same,
  scoringJob,
  validRequest,
  verifyHistoricalPublication,
} from './mutation-next-evidence.mjs';

export {
  digest,
  validateRequests,
  verifyPublication,
} from './mutation-next-evidence.mjs';

function completeInventory(inventory) {
  return (
    inventory?.complete === true &&
    Array.isArray(inventory.entries) &&
    inventory.entries.length <= 100
  );
}

function validClaim(claim, request) {
  return (
    claim?.schema === 'jovie.mutation-next-claim/v1' &&
    validRequest(request) &&
    claim.requestId === request.requestId &&
    claim.requestDigest === request.requestDigest &&
    claim.file === request.file &&
    claim.maxFiles === 1 &&
    same(claim.predecessor, request.predecessor) &&
    typeof claim.runId === 'string' &&
    id(claim.runId) !== null &&
    claim.runId !== request.predecessor.runId &&
    typeof claim.runAttempt === 'string' &&
    id(claim.runAttempt) !== null &&
    SHA.test(claim.transportSha ?? '') &&
    SHA.test(claim.testedSha ?? '') &&
    HASH.test(claim.ledgerDigest ?? '') &&
    integer(claim.previousSequence)
  );
}

function claimRequest(claim) {
  return {
    requestId: claim?.requestId,
    file: claim?.file,
    maxFiles: claim?.maxFiles,
    predecessor: claim?.predecessor,
    requestDigest: claim?.requestDigest,
  };
}

export function buildClaim(request, context) {
  const {
    runId,
    runAttempt,
    transportSha,
    testedSha,
    ledgerDigest,
    previousSequence,
  } = context ?? {};
  const claim = {
    schema: 'jovie.mutation-next-claim/v1',
    ...requestBody(request ?? {}),
    requestDigest: request?.requestDigest,
    runId: id(runId),
    runAttempt: id(runAttempt),
    transportSha,
    testedSha,
    ledgerDigest,
    previousSequence,
  };
  return validClaim(claim, request)
    ? { status: 'ready', claim }
    : hold('invalid claim identity or prior sequence');
}

/** A new ordinal and matching current-run history distinguish measurement from cache reuse. */
export function finishMeasurement(claim, measurement) {
  const { state, history, runUrl } = measurement ?? {};
  try {
    if (
      !validClaim(claim, claimRequest(claim)) ||
      runUrl !== `https://github.com/${REPO}/actions/runs/${claim.runId}`
    )
      return hold('invalid measurement claim');
    const sequence = state?.sweepSequences?.['packages/ui'];
    const module = state?.modules?.[claim.file];
    const evidence = module?.evidence;
    const completeSmallSample =
      evidence?.verdict === 'unknown' &&
      evidence.reason === 'insufficient mutation sample' &&
      module.valid < MIN_RATCHET_VALID;
    if (
      state?.schemaVersion !== 1 ||
      sequence !== claim.previousSequence + 1 ||
      module?.sha !== claim.testedSha ||
      module.status !== 'scored' ||
      module.complete !== true ||
      module.unknown !== 0 ||
      module.error ||
      !integer(module.valid) ||
      module.valid < 1 ||
      !integer(module.killed) ||
      !integer(module.survived) ||
      module.valid !== module.killed + module.survived ||
      !Number.isFinite(module.score) ||
      module.score !== Math.round((module.killed / module.valid) * 1000) / 10 ||
      !Number.isFinite(Date.parse(module.at)) ||
      evidence?.schemaVersion !== 1 ||
      evidence.runId !== sequence ||
      (!['pass', 'regression'].includes(evidence.verdict) &&
        !completeSmallSample) ||
      !['configDigest', 'selectionDigest', 'inputDigest'].every(key =>
        HASH.test(evidence[key] ?? '')
      ) ||
      !Array.isArray(evidence.inputs) ||
      !evidence.inputs.includes(claim.file) ||
      !Array.isArray(evidence.unresolvedInputs) ||
      evidence.unresolvedInputs.length !== 0 ||
      !object(module.counts)
    )
      return hold('new complete module measurement is missing');
    if (
      Object.entries(module.counts).some(
        ([name, count]) =>
          !['Killed', 'Survived', 'NoCoverage', 'CompileError'].includes(
            name
          ) || !integer(count)
      )
    )
      return hold('unresolved or malformed mutant counts');
    const equivalent = module.equivalent ?? 0;
    const undetected =
      (module.counts.Survived ?? 0) + (module.counts.NoCoverage ?? 0);
    if (
      !integer(equivalent) ||
      equivalent > undetected ||
      (module.counts.Killed ?? 0) !== module.killed ||
      undetected - equivalent !== module.survived
    )
      return hold('module counts do not match its measurement');
    const rows =
      typeof history === 'string'
        ? history
            .split('\n')
            .filter(Boolean)
            .map(line => JSON.parse(line))
        : history;
    if (!Array.isArray(rows)) return hold('measurement history is unavailable');
    if (rows.filter(row => row?.runUrl === runUrl).length !== 1)
      return hold('current run exceeds the one-file request scope');
    const matches = rows.filter(
      row =>
        row?.file === claim.file &&
        row.runUrl === runUrl &&
        row.at === module.at
    );
    if (
      matches.length !== 1 ||
      !['sha', 'status', 'score', 'valid', 'survived'].every(
        key => matches[0][key] === module[key]
      ) ||
      matches[0].ratchet !== evidence.verdict
    )
      return hold('current-run history does not attest the measurement');
    return {
      status: 'measured',
      result: {
        schema: 'jovie.mutation-next-result/v1',
        requestId: claim.requestId,
        requestDigest: claim.requestDigest,
        claimDigest: digest(claim),
        claimRunId: claim.runId,
        claimRunAttempt: claim.runAttempt,
        actualModuleSha: module.sha,
        testedSha: claim.testedSha,
        file: claim.file,
        status: 'measured',
        verdict: evidence.verdict,
        sequence,
        score: module.score,
        valid: module.valid,
      },
    };
  } catch {
    return hold('measurement evidence is malformed');
  }
}

function claimEvidence(entry, request) {
  const claim = entry?.claim;
  if (!validClaim(claim, request))
    return hold('claim conflicts with the accepted request');
  const producer = {
    runId: claim.runId,
    runAttempt: claim.runAttempt,
    sha: claim.testedSha,
    transportSha: claim.transportSha,
  };
  if (
    !runMatches(entry.run, producer, false) ||
    !runMatches(entry.latestRun, producer, false) ||
    !artifactMatches(
      entry.artifact,
      `mutation-next-claim-${request.requestId}`,
      producer
    )
  )
    return hold('claim producer identity is unknown');
  const job = scoringJob(entry.jobs, producer);
  const steps =
    job?.steps.filter(step => step?.name === 'Score the next modules') ?? [];
  if (steps.length !== 1) return hold('claim score-step history is incomplete');
  const safeRetry =
    runMatches(entry.run, producer) &&
    runMatches(entry.latestRun, producer) &&
    steps[0].status === 'completed' &&
    steps[0].conclusion === 'skipped';
  return { status: safeRetry ? 'unattempted' : 'attempted-unknown', claim };
}

/** Immutable claim/result history remains authoritative when the cached ledger is absent. */
export function selectRequest(requests, history) {
  const { ledger, claims, results } = history ?? {};
  try {
    if (
      !Array.isArray(requests) ||
      requests.length > 1 ||
      requests.some(request => !validRequest(request))
    )
      return hold('invalid accepted request set');
    if (!requests.length) return { status: 'complete' };
    const request = requests[0];
    if (!completeInventory(claims) || !completeInventory(results))
      return hold('request history is incomplete');
    if (
      new Set(claims.entries.map(entry => entry?.artifact?.id)).size !==
      claims.entries.length
    )
      return hold('claim artifact history contains duplicate identities');
    if (
      ledger != null &&
      (ledger.schema !== 'jovie.mutation-next-ledger/v1' ||
        !object(ledger.requests))
    )
      return hold('cached request ledger is malformed');
    const prior = ledger?.requests?.[request.requestId];
    if (prior && prior.requestDigest !== request.requestDigest)
      return hold('cached request identity conflicts');
    const checked = claims.entries.map(entry => claimEvidence(entry, request));
    if (checked.some(entry => entry.status === 'hold'))
      return hold('claim history is untrusted or conflicting');
    const measured = [];
    for (const entry of results.entries) {
      const result = entry?.result;
      const match = checked.find(
        row => digest(row.claim) === result?.claimDigest
      );
      if (
        !match ||
        match.status === 'unattempted' ||
        result.requestId !== request.requestId ||
        result.requestDigest !== request.requestDigest
      )
        return hold('result has no exact authenticated claim');
      const claim = match.claim;
      const predecessor = {
        runId: claim.runId,
        runAttempt: claim.runAttempt,
        sha: claim.testedSha,
        transportSha: claim.transportSha,
        cacheKey: `mutation-sweep-portable-v2-${claim.runId}-${claim.runAttempt}`,
        artifactName: `mutation-sweep-${claim.runId}`,
      };
      const publishedRequest = { ...request, predecessor };
      publishedRequest.requestDigest = digest(requestBody(publishedRequest));
      if (
        verifyHistoricalPublication(publishedRequest, entry.publication)
          .status !== 'ready'
      )
        return hold('measurement result publication is unknown');
      if (
        entry.artifact &&
        !artifactMatches(
          entry.artifact,
          `mutation-next-result-${request.requestId}`,
          predecessor
        )
      )
        return hold('result artifact identity mismatch');
      const evidence = entry.publication;
      const finished = finishMeasurement(claim, {
        state: JSON.parse(evidence.stateText),
        history: evidence.historyText,
        runUrl: `https://github.com/${REPO}/actions/runs/${claim.runId}`,
      });
      if (!('result' in finished) || !same(finished.result, result))
        return hold('result does not match published measurement');
      if (!measured.some(row => same(row, result))) measured.push(result);
    }
    const attempted = checked.filter(entry => entry.status !== 'unattempted');
    if (
      measured.length > 1 ||
      (measured.length === 1 &&
        attempted.some(
          entry => digest(entry.claim) !== measured[0].claimDigest
        ))
    )
      return hold('conflicting or duplicate measurement attempts');
    if (measured.length === 1)
      return { status: 'complete', request, result: measured[0] };
    if (attempted.length || (prior && !checked.length))
      return {
        status: 'attempted-unknown',
        request,
        reason: 'prior claim has no verified published result',
      };
    return { status: 'ready', request };
  } catch {
    return hold('request evidence could not be reconciled');
  }
}

/** One immutable wake reservation per producer run, including all its rerun attempts. */
export function planContinuation(context) {
  const {
    runId,
    runAttempt,
    publicationVerified,
    inventory,
    pending,
    rollingEligible,
    outboxes,
  } = context ?? {};
  const producer = id(runId);
  if (
    !producer ||
    !id(runAttempt) ||
    publicationVerified !== true ||
    !completeInventory(inventory) ||
    !completeInventory(outboxes) ||
    typeof pending !== 'boolean' ||
    typeof rollingEligible !== 'boolean'
  )
    return hold('continuation evidence is incomplete');
  if (outboxes.entries.length)
    return {
      status: 'attempted-unknown',
      reason: 'producer run already has a wake reservation',
    };
  if (
    inventory.entries.length !== 1 ||
    id(inventory.entries[0]?.id) !== producer ||
    inventory.entries[0]?.status !== 'in_progress'
  )
    return hold('producer inventory is not exclusive');
  if (!pending && !rollingEligible) return { status: 'complete' };
  const maxFiles = pending ? 1 : 6;
  const payload = {
    ref: 'main',
    return_run_details: true,
    inputs: { mode: 'sweep', max_files: String(maxFiles) },
  };
  return {
    status: 'ready',
    outbox: {
      schema: 'jovie.mutation-next-outbox/v1',
      runId: producer,
      runAttempt: id(runAttempt),
      mode: 'sweep',
      maxFiles,
      payload,
      payloadDigest: digest(payload),
    },
  };
}
