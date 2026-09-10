#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const MARKER_FILE = 'production-generation-verified.json';
const RECOVERY_FILE = 'production-generation-recovery.json';
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const CONTROLLER_PATH = '.github/workflows/production-controller.yml';
const MARKER_RECOVERY_PATH = '.github/workflows/production-marker-recovery.yml';
const CONTROLLER_PROMOTE_JOB = 'Production Release / Promote to Production';
const CONTROLLER_BOUNDARY_JOB =
  'Production Release / Check current main before release';
const CONTROLLER_VERIFIED_JOB = 'Production Verified';
const CONTROLLER_ROLLBACK_SUFFIX = 'Centralized production rollback';
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

function sameInteger(left, right) {
  const leftNumber = positiveInteger(left);
  const rightNumber = positiveInteger(right);
  return leftNumber !== null && leftNumber === rightNumber;
}

function validateControllerRun(run, context, attempt) {
  if (!run || typeof run !== 'object') return false;
  return (
    sameInteger(run.id, context.controllerRun) &&
    sameInteger(run.run_attempt, attempt) &&
    sameInteger(run.workflow_id, context.controllerWorkflowId) &&
    run.path === CONTROLLER_PATH &&
    run.head_sha === context.sha &&
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
    job.head_sha === context.sha &&
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
    const context = { sha, repo, controllerWorkflowId };
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
    const classified = evidence.markers.map(entry =>
      classifyMarkerEntry(entry, context)
    );
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
      evidence.markers[0].artifact.id !== evidence.markers[1].artifact.id;
    const primaryCandidates = classified.filter(
      entry => entry.attempt === 1 || entry.normalRerun || entry.recovered
    );
    if (primaryCandidates.length > 1 && !converged) {
      return manual('duplicate_primary_marker');
    }
    const primary = primaryCandidates[0];
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
      };
    }
    if (latestAttempt === 1 && evidence.latestRun.status === 'completed') {
      return {
        state: 'recovery_available',
        reason: 'one_interrupted_marker_safe_to_rerun',
        controllerRun,
        controllerAttempt: 1,
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
 * A controller attempt that coalesced into a newer main head intentionally
 * completes success without any production mutation and without preserving a
 * marker: the release boundary proved main had advanced, promotion and the
 * centralized rollback stayed skipped, and Production Verified still proved
 * the incumbent generation healthy. Such a run has no installable
 * production-proven revision, so its activation is a no-op — never a marker
 * gate failure. Any deviation from the exact coalesced job shape fails
 * closed.
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
 * Select the newest successful Production Controller run on main created
 * after the producer run. A newer success owns the newest production-proven
 * revision, so activating an older run whose exact marker binding failed
 * would install a superseded revision. Fail closed: any malformed evidence
 * means no supersession.
 */
export function selectNewerSuccessfulControllerRun(
  producerRun,
  candidates,
  context
) {
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
      run.status === 'completed' &&
      run.conclusion === 'success' &&
      SHA_PATTERN.test(run.head_sha ?? '') &&
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
 * design (no marker is ever preserved) or whether a newer successful
 * controller run owns the newest production-proven revision. Every probe
 * fails closed: ambiguity adds no fields and the caller still refuses.
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
      `repos/${context.repo}/actions/workflows/${context.controllerWorkflowId}/runs?branch=main&status=success&per_page=30`
    );
    const supersededBy = selectNewerSuccessfulControllerRun(
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

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: options.binary ? undefined : 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr)
      ? result.stderr.toString('utf8')
      : result.stderr;
    throw new Error(
      `${command} ${args.join(' ')} failed: ${stderr || 'unknown error'}`
    );
  }
  return result.stdout;
}

function ghJson(endpoint) {
  return JSON.parse(run('gh', ['api', endpoint]));
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

function downloadJsonArtifact(repo, artifactId, expectedFile) {
  const directory = mkdtempSync(join(tmpdir(), 'jovie-production-marker-'));
  const archive = join(directory, 'artifact.zip');
  try {
    const body = run(
      'gh',
      ['api', `repos/${repo}/actions/artifacts/${artifactId}/zip`],
      { binary: true }
    );
    writeFileSync(archive, body);
    const entries = run('unzip', ['-Z1', archive]).split('\n').filter(Boolean);
    if (entries.length !== 1 || entries[0] !== expectedFile) {
      throw new Error(
        `Artifact ${artifactId} does not contain exactly ${expectedFile}`
      );
    }
    return JSON.parse(run('unzip', ['-p', archive, expectedFile]));
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

function inspectOnline(args) {
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
      MARKER_FILE
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
  return withProducerActivationEvidence(args, result);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
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
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
