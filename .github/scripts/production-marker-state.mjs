#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const MARKER_FILE = 'production-generation-verified.json';
const RECOVERY_FILE = 'production-generation-recovery.json';
const RELEASE_RISK_FILE = 'release-risk-receipt.json';
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const CONTROLLER_PATH = '.github/workflows/production-controller.yml';
const MARKER_RECOVERY_PATH = '.github/workflows/production-marker-recovery.yml';
const CONTROLLER_PROMOTE_JOB = 'Production Release / Promote to Production';
const CONTROLLER_BOUNDARY_JOB =
  'Production Release / Check current main before release';
const CONTROLLER_VERIFIED_JOB = 'Production Verified';
const CONTROLLER_ROLLBACK_SUFFIX = 'Centralized production rollback';
// Jobs that run only after Production Verified succeeded and never touch
// production. Their failure files its own remediation; it must not turn a
// verified generation into an interrupted one and freeze every later release
// (JOV-7724, run 37144574062).
const POST_VERIFICATION_JOBS = new Set([
  'Publish verified customer changelog',
  'File customer changelog remediation',
]);
const INTERRUPTED_CONCLUSIONS = new Set([
  'cancelled',
  'failure',
  'startup_failure',
  'timed_out',
]);
const ACTIVE_STATUSES = new Set([
  'in_progress',
  'pending',
  'queued',
  'requested',
  'waiting',
]);

function manual(reason, detail = reason) {
  return { state: 'manual', reason, detail };
}

function positiveInteger(value) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function exactString(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function canonicalEntry(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalEntry).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalEntry(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function entryRatchetDigest(value) {
  return createHash('sha256').update(canonicalEntry(value)).digest('hex');
}

/** Bounded, secret-free marker state; it never upgrades an absent legacy measurement. */
export function validEntryRatchet(value, now = Date.now()) {
  const keys = (row, names) =>
    row &&
    typeof row === 'object' &&
    !Array.isArray(row) &&
    Object.keys(row).sort().join(',') === names.split(',').sort().join(',');
  const finite = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
  const digest = n => typeof n === 'string' && /^[a-f0-9]{64}$/.test(n);
  const identity = row =>
    keys(row, 'sha,deploymentId,origin') &&
    SHA_PATTERN.test(row.sha) &&
    /^dpl_[A-Za-z0-9]+$/.test(row.deploymentId) &&
    /^https:\/\/jovie-[a-z0-9-]+-jovie\.vercel\.app$/.test(row.origin);
  const producer = row =>
    keys(row, 'sha,runId,attempt') &&
    SHA_PATTERN.test(row.sha) &&
    positiveInteger(row.runId) === row.runId &&
    positiveInteger(row.attempt) === row.attempt;
  if (
    !keys(
      value,
      'schema,budgets,declaredAt,completedAt,policyDigest,profile,profileDigest,producer,baseline,served,candidate,reference,anchor,previousAnchor,previousAnchorDigest,initializedFrom,releaseEligible,certified,failures,digest'
    ) ||
    value.schema !== 'jovie-entry-lcp-ratchet/v1' ||
    value.releaseEligible !== true ||
    typeof value.certified !== 'boolean' ||
    !Array.isArray(value.failures) ||
    value.failures.length !== 0 ||
    !digest(value.policyDigest) ||
    !digest(value.profileDigest) ||
    !digest(value.digest) ||
    !finite(value.declaredAt) ||
    !finite(value.completedAt) ||
    value.completedAt < value.declaredAt ||
    value.completedAt - value.declaredAt > 20 * 60 * 1000 ||
    value.completedAt > now ||
    now - value.completedAt > 30 * 24 * 60 * 60 * 1000 ||
    !producer(value.producer) ||
    !['verified-served', 'retained'].includes(value.initializedFrom) ||
    !(value.previousAnchorDigest === null || digest(value.previousAnchorDigest))
  )
    return false;
  const paths = {
    start: '/start',
    claim: '/claim',
    'claim-link': '/[handle]?claim=1',
  };
  if (
    !Array.isArray(value.budgets) ||
    value.budgets.length !== 3 ||
    !Object.entries(paths).every(([id, path]) => {
      const rows = value.budgets.filter(row => row?.id === id);
      return (
        rows.length === 1 &&
        keys(rows[0], 'id,path,lcpMs,cls') &&
        rows[0].path === path &&
        finite(rows[0].lcpMs) &&
        rows[0].lcpMs > 0 &&
        rows[0].lcpMs <= 4000 &&
        finite(rows[0].cls) &&
        rows[0].cls <= 0.05
      );
    }) ||
    entryRatchetDigest({
      schema: value.schema,
      budgets: value.budgets,
      cohorts: 2,
      samples: 3,
      positiveRegressionAllowance: 0,
    }) !== value.policyDigest
  )
    return false;
  const profile = value.profile;
  const anchor = row =>
    keys(row, 'measurement,producer,role') &&
    measurement(row.measurement, now - 30 * 24 * 60 * 60 * 1000) &&
    producer(row.producer) &&
    ['served', 'candidate'].includes(row.role) &&
    (row.role === 'candidate'
      ? row.producer.sha === row.measurement.identity.sha
      : row.producer.sha !== row.measurement.identity.sha);
  if (
    !keys(
      profile,
      'harnessSha256,lighthouseVersion,browser,device,cpu,network,cache,bypass'
    ) ||
    !digest(profile.harnessSha256) ||
    !/^\d+(?:\.\d+){1,3}$/.test(profile.lighthouseVersion) ||
    !['browser', 'device', 'cpu', 'network'].every(
      key =>
        typeof profile[key] === 'string' &&
        profile[key].length > 0 &&
        profile[key].length <= 1000
    ) ||
    profile.cache !== 'reset-browser-observed-server' ||
    profile.bypass !== 'vercel-header' ||
    entryRatchetDigest(profile) !== value.profileDigest
  )
    return false;
  const measurement = (row, since = value.declaredAt) => {
    if (
      !keys(row, 'identity,profileDigest,cohorts') ||
      !identity(row.identity) ||
      row.profileDigest !== value.profileDigest ||
      !Array.isArray(row.cohorts) ||
      row.cohorts.length !== 2
    )
      return false;
    let previous = since;
    for (const [ordinal, cohort] of row.cohorts.entries()) {
      if (
        !keys(cohort, 'ordinal,startedAt,completedAt,routes') ||
        cohort.ordinal !== ordinal ||
        !finite(cohort.startedAt) ||
        !finite(cohort.completedAt) ||
        cohort.startedAt < previous ||
        cohort.completedAt < cohort.startedAt ||
        cohort.completedAt > value.completedAt ||
        !Array.isArray(cohort.routes) ||
        cohort.routes.length !== 3
      )
        return false;
      previous = cohort.completedAt;
      for (const id of ['start', 'claim', 'claim-link']) {
        const matches = cohort.routes.filter(route => route?.id === id);
        if (matches.length !== 1) return false;
        const route = matches[0];
        if (
          !keys(route, 'id,lcpSamples,clsSamples,serverCache') ||
          ![route.lcpSamples, route.clsSamples, route.serverCache].every(
            samples => Array.isArray(samples) && samples.length === 3
          ) ||
          ![...route.lcpSamples, ...route.clsSamples].every(finite) ||
          !route.serverCache.every(cache =>
            ['HIT', 'MISS', 'STALE', 'BYPASS'].includes(cache)
          )
        )
          return false;
      }
    }
    return true;
  };
  if (
    ![value.served, value.candidate, value.reference].every(row =>
      measurement(row)
    ) ||
    !anchor(value.anchor) ||
    !anchor(value.previousAnchor) ||
    value.producer.sha !== value.candidate.identity.sha ||
    !keys(
      value.baseline,
      'state,sha,deploymentId,markerArtifactId,controllerRun,controllerAttempt'
    ) ||
    value.baseline.state !== 'verified' ||
    value.baseline.sha !== value.served.identity.sha ||
    value.baseline.deploymentId !== value.served.identity.deploymentId ||
    !['markerArtifactId', 'controllerRun', 'controllerAttempt'].every(
      key => positiveInteger(value.baseline[key]) === value.baseline[key]
    ) ||
    value.candidate.identity.sha === value.served.identity.sha ||
    value.candidate.identity.deploymentId ===
      value.served.identity.deploymentId ||
    value.candidate.identity.origin === value.served.identity.origin ||
    canonicalEntry(value.reference.identity) !==
      canonicalEntry(value.previousAnchor.measurement.identity)
  )
    return false;
  if (value.initializedFrom === 'verified-served') {
    if (
      value.previousAnchorDigest !== null ||
      canonicalEntry(value.previousAnchor) !==
        canonicalEntry({
          measurement: value.served,
          producer: value.producer,
          role: 'served',
        })
    )
      return false;
  } else if (
    value.previousAnchorDigest !== entryRatchetDigest(value.previousAnchor)
  )
    return false;
  const medians = (row, id, metric) =>
    row.cohorts.map(
      cohort =>
        [...cohort.routes.find(route => route.id === id)[metric]].sort(
          (a, b) => a - b
        )[1]
    );
  let improved = false;
  let certified = true;
  for (const budget of value.budgets) {
    const rows = [
      value.served,
      value.candidate,
      value.reference,
      value.previousAnchor.measurement,
    ];
    const states = rows.flatMap(row =>
      row.cohorts.map(
        cohort =>
          cohort.routes.find(route => route.id === budget.id).serverCache
      )
    );
    if (
      !states.every(
        state => canonicalEntry(state) === canonicalEntry(states[0])
      )
    )
      return false;
    const observed = Math.max(
      ...medians(value.candidate, budget.id, 'lcpSamples')
    );
    const old = Math.min(
      ...medians(value.previousAnchor.measurement, budget.id, 'lcpSamples')
    );
    const limit = Math.min(
      old,
      ...medians(value.served, budget.id, 'lcpSamples'),
      ...medians(value.reference, budget.id, 'lcpSamples')
    );
    const cls = Math.max(...medians(value.candidate, budget.id, 'clsSamples'));
    if (observed > limit || cls > budget.cls) return false;
    if (observed > budget.lcpMs) certified = false;
    const noise = Math.max(
      ...rows.slice(0, 3).map(row => {
        const values = medians(row, budget.id, 'lcpSamples');
        return Math.max(...values) - Math.min(...values);
      })
    );
    if (old - observed > noise) improved = true;
  }
  const expectedAnchor = improved
    ? {
        measurement: value.candidate,
        producer: value.producer,
        role: 'candidate',
      }
    : value.previousAnchor;
  if (
    value.certified !== certified ||
    canonicalEntry(value.anchor) !== canonicalEntry(expectedAnchor)
  )
    return false;
  const { digest: ignored, ...body } = value;
  return entryRatchetDigest(body) === ignored;
}

function sameInteger(left, right) {
  const leftNumber = positiveInteger(left);
  const rightNumber = positiveInteger(right);
  return leftNumber !== null && leftNumber === rightNumber;
}

// #18844's starvation bound lets a controller run for a newer main head keep
// the lease and deploy its ancestor generation. Such a run binds only when the
// live compare API proved the marker SHA is a strict ancestor of its head.
function headBinds(headSha, context) {
  return (
    headSha === context.sha || context.descendantHeads?.has(headSha) === true
  );
}

function validateControllerRun(run, context, attempt) {
  if (!run || typeof run !== 'object') return false;
  return (
    sameInteger(run.id, context.controllerRun) &&
    sameInteger(run.run_attempt, attempt) &&
    sameInteger(run.workflow_id, context.controllerWorkflowId) &&
    run.path === CONTROLLER_PATH &&
    headBinds(run.head_sha, context) &&
    run.head_branch === 'main' &&
    run.head_repository?.full_name === context.repo &&
    run.event === 'workflow_run' &&
    exactString(run.status) !== null &&
    (typeof run.conclusion === 'string' || run.conclusion === null)
  );
}

function validateControllerJob(job, context, attempt) {
  if (!job || typeof job !== 'object') return false;
  return (
    positiveInteger(job.id) !== null &&
    sameInteger(job.run_id, context.controllerRun) &&
    sameInteger(job.run_attempt, attempt) &&
    headBinds(job.head_sha, context) &&
    job.head_branch === 'main' &&
    exactString(job.name) !== null &&
    exactString(job.status) !== null &&
    (typeof job.conclusion === 'string' || job.conclusion === null)
  );
}

function validateArtifact(artifact, expectedName) {
  return (
    artifact &&
    typeof artifact === 'object' &&
    positiveInteger(artifact.id) !== null &&
    artifact.name === expectedName &&
    typeof artifact.expired === 'boolean' &&
    positiveInteger(artifact.workflowRunId) !== null
  );
}

function validateMarkerPayload(payload, context, artifact) {
  const identityMatches =
    payload &&
    typeof payload === 'object' &&
    payload.sha === context.sha &&
    typeof payload.deploymentId === 'string' &&
    sameInteger(payload.controllerRun, artifact.workflowRunId) &&
    positiveInteger(payload.controllerAttempt) !== null;
  if (!identityMatches) return false;
  if (
    payload.entryMeasurementStatus !== undefined &&
    !entryPolicyAllows(
      payload,
      payload.releasePolicy,
      payload.entryMeasurementStatus
    )
  )
    return false;
  if (
    payload.entryRatchet != null &&
    (!['measured', 'carried'].includes(payload.entryMeasurementStatus) ||
      !validEntryRatchet(payload.entryRatchet))
  )
    return false;
  if (
    payload.entryMeasurementStatus !== undefined &&
    !['measured', 'carried', 'uninitialized'].includes(
      payload.entryMeasurementStatus
    )
  )
    return false;
  if (
    payload.entryMeasurementStatus === 'uninitialized' &&
    payload.entryRatchet != null
  )
    return false;
  if (
    ['measured', 'carried'].includes(payload.entryMeasurementStatus) &&
    !payload.entryRatchet
  )
    return false;
  if (
    payload.entryMeasurementStatus === 'measured' &&
    (payload.entryRatchet.producer.sha !== payload.sha ||
      payload.entryRatchet.candidate.identity.deploymentId !==
        payload.deploymentId ||
      !sameInteger(
        payload.entryRatchet.producer.runId,
        payload.recoveredFromControllerRun ?? payload.controllerRun
      ) ||
      !sameInteger(
        payload.entryRatchet.producer.attempt,
        payload.recoveredFromControllerAttempt ?? payload.controllerAttempt
      ))
  )
    return false;
  if (/^dpl_[A-Za-z0-9]+$/.test(payload.deploymentId)) return true;
  return (
    payload.deploymentId === 'not-applicable' &&
    SHA_PATTERN.test(payload.deploymentBaseSha ?? '') &&
    payload.webEvidenceSha === 'none' &&
    Array.isArray(payload.selectedLanes) &&
    !payload.selectedLanes.includes('web') &&
    payload.authSmoke === 'not-applicable'
  );
}

function validateRecoveryPayload(payload, context, artifact) {
  return (
    payload &&
    typeof payload === 'object' &&
    payload.sha === context.sha &&
    sameInteger(payload.controllerRun, context.controllerRun) &&
    sameInteger(payload.controllerRun, artifact.workflowRunId) &&
    positiveInteger(payload.controllerAttempt) === 2
  );
}

function markerNameForAttempt(sha, attempt) {
  if (attempt === 1) return `production-generation-verified-${sha}`;
  if (attempt === 2) return `production-generation-verified-recovery-${sha}`;
  return null;
}

/**
 * A recovered marker is written by the bounded event-driven or manual recovery
 * path after it re-proves canonical ownership and every exact runtime probe for
 * a generation whose original controller run never preserved a marker. The
 * uploading recovery run replaces the controller-run binding; the payload must
 * name the exact original controller run attempt it recovers.
 */
function validatePostWriteRefreshFailure(jobs, context, attempt) {
  if (!Array.isArray(jobs) || jobs.length !== 1) return false;
  const job = jobs[0];
  if (
    !job ||
    typeof job !== 'object' ||
    !sameInteger(job.run_id, context.controllerRun) ||
    !sameInteger(job.run_attempt, attempt) ||
    job.name !== 'Recover exact verified-generation marker' ||
    job.head_branch !== 'main' ||
    job.status !== 'completed' ||
    job.conclusion !== 'failure' ||
    !Array.isArray(job.steps)
  ) {
    return false;
  }
  const requiredSuccessfulSteps = [
    'Validate bounded recovery request',
    'Verify canonical ownership and exact runtime probes',
    'Re-probe production Better Auth OAuth runtime',
    'Preserve recovered verified-generation marker',
    'Upload recovered verified-generation marker',
    'Confirm uploaded recovered marker bytes',
  ];
  const dispatchName = 'Dispatch fresh fleet and desktop reconciliation';
  const requiredSteps = [...requiredSuccessfulSteps, dispatchName].map(name =>
    job.steps.filter(step => step?.name === name)
  );
  if (requiredSteps.some(matches => matches.length !== 1)) return false;
  const dispatch = requiredSteps.at(-1)[0];
  if (
    dispatch.status !== 'completed' ||
    dispatch.conclusion !== 'failure' ||
    !positiveInteger(dispatch.number)
  ) {
    return false;
  }
  for (const [index, name] of requiredSuccessfulSteps.entries()) {
    const step = requiredSteps[index][0];
    if (
      step.name !== name ||
      step.status !== 'completed' ||
      step.conclusion !== 'success' ||
      !positiveInteger(step.number) ||
      step.number >= dispatch.number
    ) {
      return false;
    }
  }
  return job.steps.every(
    step =>
      step?.status === 'completed' &&
      (step.name === dispatchName
        ? step.conclusion === 'failure'
        : step.conclusion === 'success')
  );
}

function validateMarkerRecoveryRun(run, context, attempt, jobs) {
  if (!run || typeof run !== 'object') return false;
  const trustedRecoveryEvent =
    run.event === 'workflow_dispatch' || run.event === 'workflow_run';
  const completedWithDurableProof =
    run.status === 'completed' &&
    (run.conclusion === 'success' ||
      (run.conclusion === 'failure' &&
        validatePostWriteRefreshFailure(jobs, context, attempt)));
  return (
    sameInteger(run.id, context.controllerRun) &&
    sameInteger(run.run_attempt, attempt) &&
    run.path === MARKER_RECOVERY_PATH &&
    run.head_branch === 'main' &&
    run.head_repository?.full_name === context.repo &&
    trustedRecoveryEvent &&
    completedWithDurableProof
  );
}

function classifyRecoveredMarkerEntry(entry, context) {
  const artifact = entry.artifact;
  const payload = entry.payload;
  const expectedName = `production-generation-verified-${context.sha}`;
  if (
    !validateArtifact(artifact, expectedName) ||
    artifact.expired ||
    !validateMarkerPayload(payload, context, artifact)
  ) {
    return { error: 'malformed_or_contradictory_marker' };
  }
  const controllerRun = positiveInteger(payload.controllerRun);
  const attempt = positiveInteger(payload.controllerAttempt);
  const sourceRun = positiveInteger(payload.recoveredFromControllerRun);
  const sourceAttempt = positiveInteger(payload.recoveredFromControllerAttempt);
  if (!controllerRun || !attempt || !sourceRun || !sourceAttempt) {
    return { error: 'malformed_or_contradictory_marker' };
  }
  const markerContext = { ...context, controllerRun };
  if (
    !validateMarkerRecoveryRun(
      entry.attemptRun,
      markerContext,
      attempt,
      entry.attemptJobs
    )
  ) {
    return { error: 'contradictory_marker_attempt' };
  }
  const sourceContext = { ...context, controllerRun: sourceRun };
  if (
    !validateControllerRun(entry.originalRun, sourceContext, sourceAttempt) ||
    entry.originalRun.status !== 'completed'
  ) {
    return { error: 'contradictory_recovery_source_run' };
  }
  if (!Array.isArray(entry.originalJobs)) {
    return { error: 'malformed_recovery_source_jobs' };
  }
  // The generation is recoverable only while it still owns production: the
  // original run's centralized rollback must have been skipped, never run.
  const rollbackJobs = entry.originalJobs.filter(
    job =>
      typeof job?.name === 'string' &&
      job.name.endsWith('Centralized production rollback')
  );
  if (
    rollbackJobs.length !== 1 ||
    !validateControllerJob(rollbackJobs[0], sourceContext, sourceAttempt) ||
    rollbackJobs[0].status !== 'completed' ||
    rollbackJobs[0].conclusion !== 'skipped'
  ) {
    return { error: 'unsafe_or_contradictory_rollback' };
  }
  return {
    kind: 'verified',
    attempt,
    controllerRun,
    deploymentId: payload.deploymentId,
    markerContext,
    recovered: true,
    sourceRun,
    sourceAttempt,
    sourceConclusion: entry.originalRun.conclusion,
  };
}

/**
 * A failed attempt still verified its generation when Production Verified
 * succeeded, the rollback stayed skipped, and every unsuccessful job is a
 * post-verification publication job. Any other failure stays interrupted.
 */
function verifiedBeforePublicationFailure(jobs, context, attempt) {
  if (!jobs.every(job => validateControllerJob(job, context, attempt))) {
    return false;
  }
  const verified = jobs.filter(job => job.name === CONTROLLER_VERIFIED_JOB);
  const rollback = jobs.filter(job =>
    job.name.endsWith(CONTROLLER_ROLLBACK_SUFFIX)
  );
  const unsuccessful = jobs.filter(
    job =>
      job.status !== 'completed' ||
      (job.conclusion !== 'success' && job.conclusion !== 'skipped')
  );
  return (
    verified.length === 1 &&
    verified[0].status === 'completed' &&
    verified[0].conclusion === 'success' &&
    rollback.length === 1 &&
    rollback[0].status === 'completed' &&
    rollback[0].conclusion === 'skipped' &&
    unsuccessful.length > 0 &&
    unsuccessful.every(
      job =>
        POST_VERIFICATION_JOBS.has(job.name) &&
        job.status === 'completed' &&
        INTERRUPTED_CONCLUSIONS.has(job.conclusion)
    )
  );
}

function classifyMarkerEntry(entry, context) {
  if (!entry || typeof entry !== 'object') {
    return { error: 'malformed_marker_entry' };
  }
  if (
    entry.payload?.recoveredFromControllerRun !== undefined ||
    entry.attemptRun?.path === MARKER_RECOVERY_PATH
  ) {
    return classifyRecoveredMarkerEntry(entry, context);
  }
  const artifact = entry.artifact;
  const attempt = positiveInteger(entry.payload?.controllerAttempt);
  // ponytail: upload naming follows marker_recovery, not GitHub's run_attempt.
  // A full retry before the first marker exists still publishes the normal name.
  const normalRerun =
    attempt === 2 &&
    artifact?.name === `production-generation-verified-${context.sha}`;
  const expectedName = normalRerun
    ? artifact.name
    : markerNameForAttempt(context.sha, attempt);
  if (
    !expectedName ||
    !validateArtifact(artifact, expectedName) ||
    artifact.expired ||
    !validateMarkerPayload(entry.payload, context, artifact)
  ) {
    return { error: 'malformed_or_contradictory_marker' };
  }
  const controllerRun = positiveInteger(entry.payload.controllerRun);
  const markerContext = { ...context, controllerRun };
  if (!validateControllerRun(entry.attemptRun, markerContext, attempt)) {
    return { error: 'contradictory_marker_attempt' };
  }
  if (!Array.isArray(entry.attemptJobs)) {
    return { error: 'malformed_marker_jobs' };
  }
  const verifiedJobs = entry.attemptJobs.filter(
    job => job?.name === 'Production Verified'
  );
  if (
    verifiedJobs.length !== 1 ||
    !validateControllerJob(verifiedJobs[0], markerContext, attempt)
  ) {
    return { error: 'contradictory_verified_job' };
  }
  const status = entry.attemptRun.status;
  const conclusion = entry.attemptRun.conclusion;
  if (status === 'completed' && conclusion === 'success') {
    if (
      verifiedJobs[0].status !== 'completed' ||
      verifiedJobs[0].conclusion !== 'success'
    ) {
      return { error: 'successful_attempt_without_verified_job' };
    }
    return {
      kind: 'verified',
      attempt,
      controllerRun,
      deploymentId: entry.payload.deploymentId,
      markerContext,
      normalRerun,
    };
  }
  if (
    status === 'completed' &&
    // A cancelled run (e.g. concurrency cancelling the changelog publication)
    // is judged by the same job-level proof: Production Verified succeeded,
    // rollback skipped, only publication jobs unsuccessful. Run 40932269374
    // (5cbe0cb) froze every release for 3h by being classified interrupted.
    (conclusion === 'failure' || conclusion === 'cancelled') &&
    verifiedBeforePublicationFailure(entry.attemptJobs, markerContext, attempt)
  ) {
    return {
      kind: 'verified',
      attempt,
      controllerRun,
      deploymentId: entry.payload.deploymentId,
      markerContext,
      normalRerun,
      // The producer run itself still ended in an interrupted conclusion, so
      // a recovery receipt bound to this exact attempt replaces this receipt
      // (same strict pairing as the interrupted-primary case below) instead
      // of reading as a competing primary.
      producerConclusion: conclusion,
    };
  }
  if (ACTIVE_STATUSES.has(status)) {
    return {
      kind: 'active',
      attempt,
      controllerRun,
      markerContext,
      normalRerun,
    };
  }
  if (normalRerun) return { error: 'normal_rerun_not_verified' };
  if (status === 'completed' && INTERRUPTED_CONCLUSIONS.has(conclusion)) {
    return {
      kind: 'interrupted',
      attempt,
      controllerRun,
      deploymentId: entry.payload.deploymentId,
      markerContext,
      attemptJobs: entry.attemptJobs,
    };
  }
  return { error: 'unsupported_marker_attempt_state' };
}

/**
 * Classify one exact production generation from already-fetched evidence.
 * Marker payload identity owns the historical attempt selection. Callers must
 * never substitute the latest run_attempt for marker.controllerAttempt.
 */
export function classifyProductionMarkerEvidence(evidence) {
  try {
    const sha = exactString(evidence?.sha);
    const repo = exactString(evidence?.repo);
    const controllerWorkflowId = positiveInteger(
      evidence?.controllerWorkflowId
    );
    if (!sha || !/^[0-9a-f]{40}$/.test(sha) || !repo || !controllerWorkflowId) {
      return manual('invalid_context');
    }
    const descendantHeads = evidence.descendantHeads ?? [];
    if (
      !Array.isArray(descendantHeads) ||
      !descendantHeads.every(
        head =>
          typeof head === 'string' && SHA_PATTERN.test(head) && head !== sha
      )
    ) {
      return manual('invalid_context');
    }
    const context = {
      sha,
      repo,
      controllerWorkflowId,
      descendantHeads: new Set(descendantHeads),
    };
    if (!Array.isArray(evidence.markers)) {
      return manual('malformed_marker_listing');
    }
    if (evidence.markers.length === 0) {
      const recoveryName = `production-generation-recovery-${sha}`;
      if (
        !Array.isArray(evidence.recoveryArtifacts) ||
        !evidence.recoveryArtifacts.every(artifact =>
          validateArtifact(artifact, recoveryName)
        )
      ) {
        return manual('malformed_recovery_listing');
      }
      if (evidence.recoveryArtifacts.length > 0) {
        return manual('recovery_lease_without_marker');
      }
      return { state: 'none', reason: 'no_marker' };
    }
    if (evidence.markers.length > 2) return manual('multiple_markers');
    const classified = evidence.markers.map(entry => ({
      ...classifyMarkerEntry(entry, context),
      entryDigest: entry.payload?.entryRatchet?.digest ?? null,
    }));
    const invalid = classified.find(entry => entry.error);
    if (invalid) return manual(invalid.error);
    // Attempts are scoped to their producer run: recovery and controller runs
    // may independently reach attempt 2 without duplicating either receipt.
    const attempts = classified.map(
      entry => `${entry.controllerRun}:${entry.attempt}`
    );
    if (new Set(attempts).size !== attempts.length) {
      return manual('duplicate_marker_attempt');
    }
    // Automatic marker recovery can finish while the original controller's
    // failed-job retry is still running. Preserve both immutable receipts, but
    // accept their convergence only when each chain independently verifies the
    // same deployment and recovery names the retry's interrupted first attempt.
    const recovered = classified.find(entry => entry.recovered);
    const retry = classified.find(entry => entry.normalRerun);
    const converged =
      classified.length === 2 &&
      recovered?.kind === 'verified' &&
      retry?.kind === 'verified' &&
      recovered.sourceRun === retry.controllerRun &&
      recovered.sourceAttempt === 1 &&
      INTERRUPTED_CONCLUSIONS.has(recovered.sourceConclusion) &&
      recovered.deploymentId === retry.deploymentId &&
      recovered.entryDigest === retry.entryDigest &&
      evidence.markers[0].artifact.id !== evidence.markers[1].artifact.id;
    const primaryCandidates = classified.filter(
      entry => entry.attempt === 1 || entry.normalRerun || entry.recovered
    );
    // A recovered marker naming the interrupted primary's exact producer
    // attempt and the same exact deployment replaces that receipt: the
    // bounded recovery re-proved the identical canonical binding rather than
    // competing for primary authority. Any other pairing is a duplicate.
    // The replaceable primary is an interrupted entry, or a verified entry
    // whose producer run still ended in an interrupted conclusion (the
    // cancelled/failure publication-proof shape above). A genuinely
    // successful primary is never replaceable: a recovery receipt beside
    // one stays duplicate_primary_marker.
    const replacedPrimary = primaryCandidates.find(
      entry =>
        !entry.recovered &&
        (entry.kind === 'interrupted' ||
          INTERRUPTED_CONCLUSIONS.has(entry.producerConclusion))
    );
    const replacedInterrupted =
      classified.length === 2 &&
      recovered?.kind === 'verified' &&
      replacedPrimary !== undefined &&
      recovered.sourceRun === replacedPrimary.controllerRun &&
      recovered.sourceAttempt === replacedPrimary.attempt &&
      INTERRUPTED_CONCLUSIONS.has(recovered.sourceConclusion) &&
      recovered.deploymentId === replacedPrimary.deploymentId &&
      recovered.entryDigest === replacedPrimary.entryDigest;
    if (primaryCandidates.length > 1 && !converged && !replacedInterrupted) {
      return manual('duplicate_primary_marker');
    }
    const primary = replacedInterrupted ? recovered : primaryCandidates[0];
    const recovery = classified.find(
      entry => entry.attempt === 2 && !entry.recovered && !entry.normalRerun
    );
    const recoveryName = `production-generation-recovery-${sha}`;
    const recoveryArtifacts = evidence.recoveryArtifacts;
    if (!Array.isArray(recoveryArtifacts)) {
      return manual('malformed_recovery_listing');
    }
    if (
      !recoveryArtifacts.every(artifact =>
        validateArtifact(artifact, recoveryName)
      )
    ) {
      return manual('malformed_recovery_listing');
    }
    if (recoveryArtifacts.some(artifact => artifact.expired)) {
      return manual('expired_recovery_lease');
    }
    if (recoveryArtifacts.length > 1) return manual('multiple_recovery_leases');
    if (converged) {
      if (recoveryArtifacts.length > 0) {
        return manual('recovery_evidence_after_verified_primary');
      }
      return {
        state: 'verified',
        reason: 'exact_recovery_and_retry_verified',
        controllerRun: retry.controllerRun,
        controllerAttempt: retry.attempt,
        deploymentId: retry.deploymentId,
      };
    }
    if (!primary) return manual('recovery_marker_without_primary');
    if (primary.kind === 'verified') {
      if (recovery || recoveryArtifacts.length > 0) {
        return manual('recovery_evidence_after_verified_primary');
      }
      return {
        state: 'verified',
        reason: primary.recovered
          ? 'exact_recovered_generation_verified'
          : 'exact_attempt_verified',
        controllerRun: primary.controllerRun,
        controllerAttempt: primary.attempt,
        deploymentId: primary.deploymentId,
      };
    }
    if (primary.kind === 'active') {
      if (recovery || recoveryArtifacts.length > 0) {
        return manual('recovery_evidence_while_primary_active');
      }
      return {
        state: 'pending',
        reason: 'primary_marker_attempt_active',
        controllerRun: primary.controllerRun,
        controllerAttempt: primary.attempt,
      };
    }
    if (primary.kind !== 'interrupted') {
      return manual('unsupported_primary_marker_state');
    }
    if (
      recovery?.controllerRun !== undefined &&
      recovery.controllerRun !== primary.controllerRun
    ) {
      return manual('cross_run_recovery_marker');
    }
    const controllerRun = primary.controllerRun;
    const markerContext = primary.markerContext;
    const rollbackJobs = primary.attemptJobs.filter(
      job =>
        typeof job?.name === 'string' &&
        job.name.endsWith('Centralized production rollback')
    );
    if (
      rollbackJobs.length !== 1 ||
      !validateControllerJob(rollbackJobs[0], markerContext, 1) ||
      rollbackJobs[0].status !== 'completed' ||
      rollbackJobs[0].conclusion !== 'skipped'
    ) {
      return manual('unsafe_or_contradictory_rollback');
    }

    if (recovery && recoveryArtifacts.length !== 1) {
      return manual('recovery_marker_without_lease');
    }

    if (recoveryArtifacts.length === 1) {
      const recoveryArtifact = recoveryArtifacts[0];
      if (
        !validateRecoveryPayload(
          evidence.recoveryPayload,
          markerContext,
          recoveryArtifact
        ) ||
        !validateControllerRun(evidence.recoveryAttemptRun, markerContext, 2)
      ) {
        return manual('contradictory_recovery_lease');
      }
      if (recovery?.kind === 'verified') {
        if (
          evidence.recoveryAttemptRun.status !== 'completed' ||
          evidence.recoveryAttemptRun.conclusion !== 'success'
        ) {
          return manual('recovery_marker_lease_state_mismatch');
        }
        return {
          state: 'verified',
          reason: 'exact_recovery_attempt_verified',
          controllerRun: recovery.controllerRun,
          controllerAttempt: 2,
          deploymentId: recovery.deploymentId,
        };
      }
      if (recovery?.kind === 'active') {
        return {
          state: 'pending',
          reason: 'recovery_marker_attempt_active',
          controllerRun,
          controllerAttempt: 2,
        };
      }
      if (recovery) return manual('recovery_marker_attempt_exhausted');
      if (ACTIVE_STATUSES.has(evidence.recoveryAttemptRun.status)) {
        return {
          state: 'pending',
          reason: 'recovery_attempt_active',
          controllerRun,
          controllerAttempt: 2,
        };
      }
      return manual('recovery_lease_consumed');
    }

    if (
      !validateControllerRun(
        evidence.latestRun,
        markerContext,
        evidence.latestRun?.run_attempt
      )
    ) {
      return manual('contradictory_latest_run');
    }
    const latestAttempt = positiveInteger(evidence.latestRun.run_attempt);
    const actorRun = positiveInteger(evidence.actor?.runId);
    const actorAttempt = positiveInteger(evidence.actor?.attempt);
    if (
      latestAttempt === 2 &&
      ACTIVE_STATUSES.has(evidence.latestRun.status) &&
      actorRun === controllerRun &&
      actorAttempt === 2
    ) {
      return {
        state: 'recovery_available',
        reason: 'current_recovery_attempt_requires_lease',
        controllerRun,
        controllerAttempt: 1,
        deploymentId: primary.deploymentId,
      };
    }
    if (latestAttempt === 1 && evidence.latestRun.status === 'completed') {
      return {
        state: 'recovery_available',
        reason: 'one_interrupted_marker_safe_to_rerun',
        controllerRun,
        controllerAttempt: 1,
        deploymentId: primary.deploymentId,
      };
    }
    if (latestAttempt === 2 && ACTIVE_STATUSES.has(evidence.latestRun.status)) {
      return {
        state: 'pending',
        reason: 'recovery_attempt_started_before_lease_visible',
        controllerRun,
        controllerAttempt: 2,
      };
    }
    return manual('recovery_attempt_exhausted_or_contradictory');
  } catch (error) {
    return manual(
      'classification_error',
      error instanceof Error ? error.message : String(error)
    );
  }
}

/**
 * Coalescence supplies skip-only evidence, never an installable revision.
 * Early release-wave coalescence skips the entire release and verification;
 * late coalescence proves main advanced at the release boundary, skips
 * promotion/rollback, and verifies the incumbent generation. Recognize each
 * shape separately without requiring a newer-head successor for the early
 * no-op. Actual activation still requires an exact verified marker.
 */
export function classifyProducerCoalescence(run, jobs) {
  if (
    !run ||
    typeof run !== 'object' ||
    positiveInteger(run.id) === null ||
    run.path !== CONTROLLER_PATH ||
    run.head_branch !== 'main' ||
    run.status !== 'completed' ||
    run.conclusion !== 'success' ||
    !Array.isArray(jobs)
  ) {
    return false;
  }
  const exactlyOne = (name, conclusion) =>
    jobs.filter(
      job =>
        job?.name === name &&
        job.status === 'completed' &&
        job.conclusion === conclusion
    ).length === 1;
  // Early release-wave coalescence skips the reusable release as a whole,
  // so it has no expanded promotion/rollback jobs or verified marker. This
  // exact no-op shape only supplies skip evidence; it never verifies a deploy.
  const earlyCoalescence = [
    ['Coalesce release wave', 'success'],
    ['Authorize fleet deployment state', 'skipped'],
    ['Authorize exact main CI evidence', 'skipped'],
    ['Production Release', 'skipped'],
    ['Post-Deploy Smoke (Production)', 'skipped'],
    ['Lighthouse CI (Production)', 'skipped'],
    ['Post-Deploy Auth Smoke (Production)', 'skipped'],
    [CONTROLLER_VERIFIED_JOB, 'skipped'],
  ];
  if (
    jobs.length === earlyCoalescence.length &&
    earlyCoalescence.every(([name, conclusion]) => exactlyOne(name, conclusion))
  ) {
    return true;
  }
  const rollback = jobs.filter(
    job =>
      typeof job?.name === 'string' &&
      job.name.endsWith(CONTROLLER_ROLLBACK_SUFFIX)
  );
  return (
    exactlyOne(CONTROLLER_PROMOTE_JOB, 'skipped') &&
    exactlyOne(CONTROLLER_BOUNDARY_JOB, 'success') &&
    exactlyOne(CONTROLLER_VERIFIED_JOB, 'success') &&
    rollback.length === 1 &&
    rollback[0].status === 'completed' &&
    rollback[0].conclusion === 'skipped'
  );
}

/**
 * Select the newest Production Controller run on main for a newer head,
 * created after the producer run, in any state except startup failure. Its
 * completion owns the newest revision's activation path: a successful
 * completion fires its own activation for the newest production-proven
 * marker, and an unsuccessful one leaves no installable revision either way.
 * The triggering producer's missing marker is therefore a supersession
 * no-op, not an anomaly. Fail closed: any malformed evidence means no
 * supersession.
 */
export function selectNewerControllerRun(producerRun, candidates, context) {
  if (
    !validateControllerRun(producerRun, context, producerRun?.run_attempt) ||
    producerRun.status !== 'completed' ||
    typeof producerRun.created_at !== 'string'
  ) {
    return null;
  }
  const producerCreatedAt = Date.parse(producerRun.created_at);
  if (!Number.isFinite(producerCreatedAt) || !Array.isArray(candidates)) {
    return null;
  }
  const newer = candidates.filter(
    run =>
      run &&
      typeof run === 'object' &&
      positiveInteger(run.id) !== null &&
      !sameInteger(run.id, context.controllerRun) &&
      run.path === CONTROLLER_PATH &&
      run.head_branch === 'main' &&
      run.head_repository?.full_name === context.repo &&
      // A newer main head, not a same-sha retry of the producer.
      run.head_sha !== context.sha &&
      SHA_PATTERN.test(run.head_sha ?? '') &&
      typeof run.status === 'string' &&
      // A startup failure never executed and supersedes nothing; every other
      // state (in flight, queued, completed with any conclusion) proves the
      // newer head was picked up and owns the activation path.
      run.conclusion !== 'startup_failure' &&
      typeof run.created_at === 'string' &&
      Date.parse(run.created_at) > producerCreatedAt
  );
  if (newer.length === 0) return null;
  newer.sort(
    (left, right) => Date.parse(right.created_at) - Date.parse(left.created_at)
  );
  return {
    run: positiveInteger(newer[0].id),
    sha: newer[0].head_sha,
    createdAt: newer[0].created_at,
  };
}

function fetchProducerAttemptEvidence(repo, producerRunId, producerAttempt) {
  const attemptRun = ghJson(
    `repos/${repo}/actions/runs/${producerRunId}/attempts/${producerAttempt}`
  );
  const attemptJobs = normalizeProductionJobs(
    ghJson(
      `repos/${repo}/actions/runs/${producerRunId}/attempts/${producerAttempt}/jobs?per_page=100`
    )
  );
  return { attemptRun, attemptJobs };
}

/**
 * Activation-facing producer evidence (opt-in via --producer-run-id and
 * --producer-attempt). When the exact verified marker binding for the
 * triggering producer attempt fails, prove whether that attempt coalesced by
 * design (no marker is ever preserved) or whether a newer controller run for
 * a newer main head already owns the activation path. Every probe fails
 * closed: ambiguity adds no fields and the caller still refuses.
 */
function withProducerActivationEvidence(args, result) {
  const producerRunId = positiveInteger(args['producer-run-id']);
  const producerAttempt = positiveInteger(args['producer-attempt']);
  if (producerRunId === null || producerAttempt === null) return result;
  if (
    result.state === 'verified' &&
    sameInteger(result.controllerRun, producerRunId) &&
    sameInteger(result.controllerAttempt, producerAttempt)
  ) {
    return result;
  }
  const context = {
    sha: args.sha,
    repo: args.repo,
    controllerRun: producerRunId,
    controllerWorkflowId: positiveInteger(args['controller-workflow-id']),
  };
  let producer;
  try {
    producer = fetchProducerAttemptEvidence(
      context.repo,
      producerRunId,
      producerAttempt
    );
  } catch {
    return result;
  }
  if (!validateControllerRun(producer.attemptRun, context, producerAttempt)) {
    return result;
  }
  const additions = {};
  if (
    producer.attemptJobs.every(job =>
      validateControllerJob(job, context, producerAttempt)
    ) &&
    classifyProducerCoalescence(producer.attemptRun, producer.attemptJobs)
  ) {
    additions.coalesced = true;
  }
  try {
    const listing = ghJson(
      `repos/${context.repo}/actions/workflows/${context.controllerWorkflowId}/runs?branch=main&per_page=30`
    );
    const supersededBy = selectNewerControllerRun(
      producer.attemptRun,
      listing?.workflow_runs,
      context
    );
    if (supersededBy) additions.supersededBy = supersededBy;
  } catch {
    // Supersession must be proven from live evidence, never assumed.
  }
  return Object.keys(additions).length > 0
    ? { ...result, ...additions }
    : result;
}

function spawnFailure(command, args, result) {
  const stderr = Buffer.isBuffer(result.stderr)
    ? result.stderr.toString('utf8')
    : result.stderr;
  throw new Error(
    `${command} ${args.join(' ')} failed: ${stderr || 'unknown error'}`
  );
}

function runText(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) spawnFailure(command, args, result);
  if (typeof result.stdout !== 'string') {
    throw new Error(`${command} ${args.join(' ')} returned no text`);
  }
  return result.stdout;
}

function runZip(command, args) {
  // gh 2.102 treats every GH_FORCE_TTY value, including 0, as a terminal and
  // refuses application/zip. A pipe is not a sufficient substitute: write the
  // body to a file and drop the variable.
  const env = { ...process.env };
  delete env.GH_FORCE_TTY;
  const file = join(
    tmpdir(),
    `jovie-gh-zip-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.bin`
  );
  const fd = openSync(file, 'w');
  let result;
  try {
    result = spawnSync(command, args, {
      env,
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', fd, 'pipe'],
    });
  } finally {
    closeSync(fd);
  }
  let stdout = Buffer.alloc(0);
  try {
    stdout = readFileSync(file);
    // Reader doubles return the body on stdout and do not write the fd.
    if (
      stdout.length === 0 &&
      result?.stdout != null &&
      result.stdout.length > 0
    ) {
      stdout = Buffer.isBuffer(result.stdout)
        ? result.stdout
        : Buffer.from(String(result.stdout));
    }
  } finally {
    rmSync(file, { force: true });
  }
  if (!result || result.status !== 0) {
    spawnFailure(
      command,
      args,
      result ?? { status: 1, stderr: 'spawn failed' }
    );
  }
  return stdout;
}

function ghJson(endpoint) {
  return JSON.parse(runText('gh', ['api', endpoint]));
}

function normalizeArtifacts(payload, expectedName) {
  if (
    !payload ||
    typeof payload !== 'object' ||
    !Number.isSafeInteger(payload.total_count) ||
    !Array.isArray(payload.artifacts) ||
    payload.total_count !== payload.artifacts.length
  ) {
    throw new Error(`Incomplete artifact listing for ${expectedName}`);
  }
  return payload.artifacts.map(artifact => ({
    id: artifact.id,
    name: artifact.name,
    expired: artifact.expired,
    workflowRunId: artifact.workflow_run?.id,
  }));
}

function downloadJsonArtifact(
  repo,
  artifactId,
  expectedFile,
  optionalFiles = []
) {
  const directory = mkdtempSync(join(tmpdir(), 'jovie-production-marker-'));
  const archive = join(directory, 'artifact.zip');
  try {
    const body = runZip('gh', [
      'api',
      `repos/${repo}/actions/artifacts/${artifactId}/zip`,
    ]);
    writeFileSync(archive, body);
    const entries = runText('unzip', ['-Z1', archive])
      .split('\n')
      .filter(Boolean);
    const allowedEntries = new Set([expectedFile, ...optionalFiles]);
    const uniqueEntries = new Set(entries);
    if (
      entries.filter(entry => entry === expectedFile).length !== 1 ||
      uniqueEntries.size !== entries.length ||
      entries.some(entry => !allowedEntries.has(entry))
    ) {
      throw new Error(
        `Artifact ${artifactId} does not contain one ${expectedFile} with only allowed companion files`
      );
    }
    return JSON.parse(runText('unzip', ['-p', archive, expectedFile]));
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

export function normalizeProductionJobs(payload) {
  if (
    !payload ||
    typeof payload !== 'object' ||
    !Number.isSafeInteger(payload.total_count) ||
    !Array.isArray(payload.jobs) ||
    payload.total_count !== payload.jobs.length ||
    !payload.jobs.every(
      job =>
        job &&
        typeof job === 'object' &&
        positiveInteger(job.id) !== null &&
        positiveInteger(job.run_id) !== null &&
        positiveInteger(job.run_attempt) !== null &&
        exactString(job.name) !== null &&
        exactString(job.head_sha) !== null &&
        exactString(job.head_branch) !== null &&
        exactString(job.status) !== null &&
        (typeof job.conclusion === 'string' || job.conclusion === null)
    )
  ) {
    throw new Error('Incomplete exact-attempt jobs listing');
  }
  return payload.jobs;
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) throw new Error(`Unexpected argument: ${item}`);
    const [rawKey, inlineValue] = item.slice(2).split('=', 2);
    const value = inlineValue ?? argv[index + 1];
    if (inlineValue === undefined) index += 1;
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for --${rawKey}`);
    }
    values[rawKey] = value;
  }
  return values;
}

export function inspectOnline(args) {
  const sha = args.sha;
  const repo = args.repo;
  const controllerWorkflowId = positiveInteger(args['controller-workflow-id']);
  if (!sha || !repo || !controllerWorkflowId) {
    throw new Error('--sha, --repo, and --controller-workflow-id are required');
  }
  const evidence = {
    sha,
    repo,
    controllerWorkflowId,
    actor:
      args['actor-run-id'] && args['actor-attempt']
        ? { runId: args['actor-run-id'], attempt: args['actor-attempt'] }
        : undefined,
  };
  evidence.markers = [];
  for (const markerName of [
    `production-generation-verified-${sha}`,
    `production-generation-verified-recovery-${sha}`,
  ]) {
    const artifacts = normalizeArtifacts(
      ghJson(
        `repos/${repo}/actions/artifacts?name=${encodeURIComponent(markerName)}&per_page=100`
      ),
      markerName
    );
    // Two normal-name artifacts may be the bounded recovery/retry race. Do
    // not pick the newest: download and classify both complete evidence chains.
    const limit =
      markerName === `production-generation-verified-${sha}` ? 2 : 1;
    if (artifacts.length > limit) return manual('duplicate_marker_name');
    if (artifacts.some(artifact => artifact.expired))
      return manual('expired_marker');
    for (const artifact of artifacts) evidence.markers.push({ artifact });
  }
  // Download every marker payload before selecting or querying any attempt.
  for (const marker of evidence.markers) {
    marker.payload = downloadJsonArtifact(
      repo,
      marker.artifact.id,
      MARKER_FILE,
      [RELEASE_RISK_FILE]
    );
  }
  for (const marker of evidence.markers) {
    const controllerRun = positiveInteger(marker.payload?.controllerRun);
    const controllerAttempt = positiveInteger(
      marker.payload?.controllerAttempt
    );
    if (!controllerRun || !controllerAttempt) {
      return classifyProductionMarkerEvidence(evidence);
    }
    marker.attemptRun = ghJson(
      `repos/${repo}/actions/runs/${controllerRun}/attempts/${controllerAttempt}`
    );
    marker.attemptJobs = normalizeProductionJobs(
      ghJson(
        `repos/${repo}/actions/runs/${controllerRun}/attempts/${controllerAttempt}/jobs?per_page=100`
      )
    );
    const sourceRun = positiveInteger(
      marker.payload?.recoveredFromControllerRun
    );
    const sourceAttempt = positiveInteger(
      marker.payload?.recoveredFromControllerAttempt
    );
    if (sourceRun && sourceAttempt) {
      marker.originalRun = ghJson(
        `repos/${repo}/actions/runs/${sourceRun}/attempts/${sourceAttempt}`
      );
      marker.originalJobs = normalizeProductionJobs(
        ghJson(
          `repos/${repo}/actions/runs/${sourceRun}/attempts/${sourceAttempt}/jobs?per_page=100`
        )
      );
    }
  }

  // Prove ancestry for any marker-producing run whose head is not the marker
  // SHA. Only a strict ancestor ("ahead" compare) may bind; anything else
  // stays unbound and the classifier fails closed.
  evidence.descendantHeads = [];
  const foreignHeads = new Set(
    evidence.markers
      .flatMap(marker => [marker.attemptRun, marker.originalRun])
      .map(attempt => attempt?.head_sha)
      .filter(head => typeof head === 'string' && head !== sha)
  );
  for (const head of foreignHeads) {
    if (!SHA_PATTERN.test(head)) continue;
    const comparison = ghJson(`repos/${repo}/compare/${sha}...${head}`);
    if (comparison?.status === 'ahead' && comparison?.behind_by === 0) {
      evidence.descendantHeads.push(head);
    }
  }

  const recoveryName = `production-generation-recovery-${sha}`;
  evidence.recoveryArtifacts = normalizeArtifacts(
    ghJson(
      `repos/${repo}/actions/artifacts?name=${encodeURIComponent(recoveryName)}&per_page=100`
    ),
    recoveryName
  );
  if (
    evidence.recoveryArtifacts.length === 1 &&
    !evidence.recoveryArtifacts[0].expired
  ) {
    evidence.recoveryPayload = downloadJsonArtifact(
      repo,
      evidence.recoveryArtifacts[0].id,
      RECOVERY_FILE
    );
    const leaseRun = positiveInteger(evidence.recoveryPayload?.controllerRun);
    const leaseAttempt = positiveInteger(
      evidence.recoveryPayload?.controllerAttempt
    );
    if (leaseRun && leaseAttempt) {
      evidence.recoveryAttemptRun = ghJson(
        `repos/${repo}/actions/runs/${leaseRun}/attempts/${leaseAttempt}`
      );
    }
  }

  const primary = evidence.markers.find(
    marker => positiveInteger(marker.payload?.controllerAttempt) === 1
  );
  const controllerRun = positiveInteger(primary?.payload?.controllerRun);
  const interruptedPrimary =
    controllerRun &&
    primary?.attemptRun?.status === 'completed' &&
    INTERRUPTED_CONCLUSIONS.has(primary?.attemptRun?.conclusion);
  const hasRecoveryMarker = evidence.markers.some(
    marker => positiveInteger(marker.payload?.controllerAttempt) === 2
  );
  if (interruptedPrimary && !hasRecoveryMarker) {
    if (evidence.recoveryArtifacts.length === 0) {
      // The latest run is consulted only after the marker's exact attempt has
      // been downloaded and classified as interrupted.
      evidence.latestRun = ghJson(
        `repos/${repo}/actions/runs/${controllerRun}`
      );
    }
  }
  const result = classifyProductionMarkerEvidence(evidence);
  if (result.state === 'verified' || result.state === 'pending') {
    // Evidence can arrive while archive/run/job reads are in flight. Require
    // the same immutable artifact identities and expiry states at the return
    // boundary; never authorize from a stale partial listing.
    const snapshot = artifacts =>
      JSON.stringify([...artifacts].sort((left, right) => left.id - right.id));
    for (const name of [
      `production-generation-verified-${sha}`,
      `production-generation-verified-recovery-${sha}`,
      recoveryName,
    ]) {
      const before =
        name === recoveryName
          ? evidence.recoveryArtifacts
          : evidence.markers
              .map(marker => marker.artifact)
              .filter(artifact => artifact.name === name);
      const after = normalizeArtifacts(
        ghJson(
          `repos/${repo}/actions/artifacts?name=${encodeURIComponent(name)}&per_page=100`
        ),
        name
      );
      if (snapshot(before) !== snapshot(after))
        return manual('artifact_snapshot_changed');
    }
  }
  if (result.state === 'verified') {
    const selected = evidence.markers.find(
      marker =>
        sameInteger(marker.payload.controllerRun, result.controllerRun) &&
        sameInteger(marker.payload.controllerAttempt, result.controllerAttempt)
    );
    if (!selected) return manual('missing_selected_marker');
    result.markerArtifactId = selected.artifact.id;
    result.sha = sha;
    result.entryRatchet = selected.payload.entryRatchet ?? null;
  }
  return withProducerActivationEvidence(args, result);
}

/** One authenticated, completely classified served marker; never a candidate fallback. */
export function readEntryBaseline(sha, repo) {
  const workflow = ghJson(
    `repos/${repo}/actions/workflows/production-controller.yml`
  );
  const result = inspectOnline({
    sha,
    repo,
    'controller-workflow-id': workflow.id,
  });
  if (
    result.state !== 'verified' ||
    !/^dpl_[A-Za-z0-9]+$/.test(result.deploymentId) ||
    !positiveInteger(result.markerArtifactId)
  )
    throw new Error('entry served marker unavailable');
  return {
    state: 'verified',
    sha,
    deploymentId: result.deploymentId,
    markerArtifactId: result.markerArtifactId,
    controllerRun: result.controllerRun,
    controllerAttempt: result.controllerAttempt,
    ...(result.entryRatchet ? { entryRatchet: result.entryRatchet } : {}),
  };
}

export function validateEntryHandoff(value, context) {
  if (
    !value ||
    Object.keys(value).sort().join(',') !==
      'candidate,entryRatchet,mode,producer,schema' ||
    value.schema !== 'jovie-entry-lcp-handoff/v1' ||
    !['measured', 'carried', 'uninitialized'].includes(value.mode) ||
    !value.producer ||
    Object.keys(value.producer).sort().join(',') !== 'attempt,runId,sha' ||
    !value.candidate ||
    Object.keys(value.candidate).sort().join(',') !==
      'deploymentId,origin,sha' ||
    !SHA_PATTERN.test(value.producer.sha) ||
    !/^dpl_[A-Za-z0-9]+$/.test(value.candidate.deploymentId) ||
    positiveInteger(value.producer.runId) !== value.producer.runId ||
    positiveInteger(value.producer.attempt) !== value.producer.attempt ||
    value.producer?.sha !== context.sha ||
    !sameInteger(value.producer?.runId, context.runId) ||
    !sameInteger(value.producer?.attempt, context.attempt) ||
    value.candidate?.sha !== context.sha ||
    value.candidate?.deploymentId !== context.deploymentId ||
    !/^https:\/\/jovie-[a-z0-9-]+-jovie\.vercel\.app$/.test(
      value.candidate?.origin ?? ''
    )
  )
    return false;
  if (value.mode === 'uninitialized') return value.entryRatchet === null;
  if (!validEntryRatchet(value.entryRatchet)) return false;
  return (
    value.mode !== 'measured' ||
    (value.entryRatchet.producer.sha === context.sha &&
      sameInteger(value.entryRatchet.producer.runId, context.runId) &&
      sameInteger(value.entryRatchet.producer.attempt, context.attempt) &&
      canonicalEntry(value.entryRatchet.candidate.identity) ===
        canonicalEntry(value.candidate))
  );
}

function entryPolicyAllows(marker, policy, mode) {
  if (
    policy?.schema !== 'jovie.release-risk-receipt/v1' ||
    policy.lineageSha !== marker.sha ||
    typeof policy.policyVersion !== 'string' ||
    !policy.policyVersion.startsWith('jovie.release-risk-policy/') ||
    !Array.isArray(policy.requiredProof) ||
    !policy.requiredProof.every(value => typeof value === 'string')
  )
    return false;
  if (policy.selectedLane === 'high')
    return (
      mode === 'measured' &&
      policy.requiredProof.includes('high-confidence-runtime-proof')
    );
  if (policy.selectedLane === 'not_applicable')
    return (
      marker.deploymentId === 'not-applicable' &&
      ['carried', 'uninitialized'].includes(mode)
    );
  return (
    ['low', 'medium'].includes(policy.selectedLane) &&
    ['measured', 'carried', 'uninitialized'].includes(mode)
  );
}

/** The caller supplies the authenticated original-attempt policy artifact, never a lane switch. */
export function attachEntryHandoff(marker, handoff, sealedPolicy) {
  const context = {
    sha: marker.sha,
    deploymentId: marker.deploymentId,
    runId: marker.recoveredFromControllerRun ?? marker.controllerRun,
    attempt: marker.recoveredFromControllerAttempt ?? marker.controllerAttempt,
  };
  if (!validateEntryHandoff(handoff, context))
    throw new Error('entry artifact source mismatch');
  const policyBinding = policy => ({
    schema: policy?.schema,
    policyVersion: policy?.policyVersion,
    lineageSha: policy?.lineageSha,
    selectedLane: policy?.selectedLane,
    requiredProof: policy?.requiredProof,
  });
  if (
    !entryPolicyAllows(marker, sealedPolicy, handoff.mode) ||
    (marker.releasePolicy &&
      canonicalEntry(policyBinding(marker.releasePolicy)) !==
        canonicalEntry(policyBinding(sealedPolicy)))
  )
    throw new Error('entry proof does not satisfy sealed release policy');
  return {
    ...marker,
    releasePolicy: marker.releasePolicy ?? sealedPolicy,
    entryMeasurementStatus: handoff.mode,
    entryRatchet: handoff.entryRatchet,
  };
}

function readExactEntryArtifact(context, name, file, companions = []) {
  const listing = () =>
    normalizeArtifacts(
      ghJson(
        `repos/${context.repo}/actions/artifacts?name=${encodeURIComponent(name)}&per_page=100`
      ),
      name
    );
  const before = listing();
  const selected = before.filter(artifact =>
    sameInteger(artifact.workflowRunId, context.runId)
  );
  if (
    !before.every(artifact => validateArtifact(artifact, name)) ||
    new Set(before.map(artifact => artifact.id)).size !== before.length ||
    selected.length !== 1 ||
    selected[0].expired
  )
    throw new Error('entry artifact absent, expired or ambiguous');
  const receipt = downloadJsonArtifact(
    context.repo,
    selected[0].id,
    file,
    companions
  );
  if (canonicalEntry(before) !== canonicalEntry(listing()))
    throw new Error('entry artifact changed or invalid');
  return receipt;
}

function readEntryHandoff(context) {
  const name = `entry-lcp-handoff-${context.sha}-${context.runId}-${context.attempt}`;
  const receipt = readExactEntryArtifact(
    context,
    name,
    'entry-lcp-handoff.json'
  );
  if (!validateEntryHandoff(receipt, context))
    throw new Error('entry artifact changed or invalid');
  return receipt;
}

function readEntryReleasePolicy(context) {
  return readExactEntryArtifact(
    context,
    `production-lane-range-${context.sha}-${context.attempt}`,
    RELEASE_RISK_FILE,
    ['production-lane-range.json', 'fleet-admission.json']
  );
}

function annotationDetail(result) {
  if (!result?.detail || result.detail === result.reason) return '';
  return String(result.detail).replace(/\s+/g, ' ').slice(0, 500);
}

// Release-base admission stays here so the authorize run block stays under
// GitHub's 21000-character expression cap. verified and a foreign `none`
// may proceed; every other state fails closed with the classifier reason.
export function admitReleaseBase(result, deployedSha, releaseSha) {
  if (result?.state === 'verified') {
    if (!/^dpl_[A-Za-z0-9]+$/.test(String(result.deploymentId ?? ''))) {
      return {
        ok: false,
        errors: ['Canonical production marker lacks an exact deployment ID.'],
      };
    }
    return { ok: true, errors: [] };
  }
  if (result?.state === 'none') {
    if (deployedSha === releaseSha) {
      return {
        ok: false,
        errors: [
          'Current production cannot bootstrap its own missing verified marker.',
        ],
      };
    }
    return {
      ok: true,
      errors: [],
      warning: `Bootstrapping the release range from exact canonical live SHA ${deployedSha}; the new target still requires the full production path and its own durable marker.`,
    };
  }
  const errors = [
    `Canonical production marker state is not admissible as a release base (${result?.state}: ${result?.reason}).`,
  ];
  const detail = annotationDetail(result);
  if (detail) errors.push(detail);
  return { ok: false, errors };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args['entry-baseline']) {
    process.stdout.write(
      `${JSON.stringify(readEntryBaseline(args['entry-baseline'], args.repo))}\n`
    );
    return;
  }
  if (args['entry-attach'] || args['entry-carry']) {
    const filename = args['entry-attach'] ?? args['entry-carry'];
    const marker = JSON.parse(readFileSync(filename, 'utf8'));
    let output;
    if (args['entry-carry']) {
      const baseline = readEntryBaseline(marker.deploymentBaseSha, args.repo);
      output = {
        ...marker,
        entryRatchet: baseline.entryRatchet ?? null,
        entryMeasurementStatus: baseline.entryRatchet
          ? 'carried'
          : 'uninitialized',
      };
      if (
        !entryPolicyAllows(
          output,
          marker.releasePolicy,
          output.entryMeasurementStatus
        )
      )
        throw new Error('entry carry does not satisfy sealed release policy');
    } else {
      const context = {
        repo: args.repo,
        sha: marker.sha,
        deploymentId: marker.deploymentId,
        runId: marker.recoveredFromControllerRun ?? marker.controllerRun,
        attempt:
          marker.recoveredFromControllerAttempt ?? marker.controllerAttempt,
      };
      output = attachEntryHandoff(
        marker,
        readEntryHandoff(context),
        readEntryReleasePolicy(context)
      );
    }
    writeFileSync(filename, `${JSON.stringify(output)}\n`, { mode: 0o600 });
    return;
  }
  let result;
  if (args.fixture) {
    result = classifyProductionMarkerEvidence(
      JSON.parse(readFileSync(args.fixture, 'utf8'))
    );
  } else {
    try {
      result = inspectOnline(args);
    } catch (error) {
      result = manual(
        'evidence_api_error',
        error instanceof Error ? error.message : String(error)
      );
    }
  }
  const detail = annotationDetail(result);
  process.stderr.write(
    `production-marker-state ${result.state} ${result.reason}${detail ? ` ${detail}` : ''}\n`
  );
  if (args['release-base']) {
    const admission = admitReleaseBase(result, args.sha, args['release-base']);
    if (admission.warning) {
      process.stderr.write(`::warning::${admission.warning}\n`);
    }
    for (const error of admission.errors) {
      process.stderr.write(`::error::${error}\n`);
    }
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (!admission.ok) process.exitCode = 1;
    return;
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
