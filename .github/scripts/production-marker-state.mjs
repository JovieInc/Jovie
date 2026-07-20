#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const MARKER_FILE = 'production-generation-verified.json';
const RECOVERY_FILE = 'production-generation-recovery.json';
const CONTROLLER_PATH = '.github/workflows/production-controller.yml';
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
  return (
    payload &&
    typeof payload === 'object' &&
    payload.sha === context.sha &&
    typeof payload.deploymentId === 'string' &&
    /^dpl_[A-Za-z0-9]+$/.test(payload.deploymentId) &&
    sameInteger(payload.controllerRun, artifact.workflowRunId) &&
    positiveInteger(payload.controllerAttempt) !== null
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

function classifyMarkerEntry(entry, context) {
  if (!entry || typeof entry !== 'object') {
    return { error: 'malformed_marker_entry' };
  }
  const artifact = entry.artifact;
  const attempt = positiveInteger(entry.payload?.controllerAttempt);
  const expectedName = markerNameForAttempt(context.sha, attempt);
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
    };
  }
  if (ACTIVE_STATUSES.has(status)) {
    return { kind: 'active', attempt, controllerRun, markerContext };
  }
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
    const attempts = classified.map(entry => entry.attempt);
    if (new Set(attempts).size !== attempts.length) {
      return manual('duplicate_marker_attempt');
    }
    const primary = classified.find(entry => entry.attempt === 1);
    const recovery = classified.find(entry => entry.attempt === 2);
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
    if (!primary) return manual('recovery_marker_without_primary');
    if (primary.kind === 'verified') {
      if (recovery || recoveryArtifacts.length > 0) {
        return manual('recovery_evidence_after_verified_primary');
      }
      return {
        state: 'verified',
        reason: 'exact_attempt_verified',
        controllerRun: primary.controllerRun,
        controllerAttempt: 1,
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
        controllerAttempt: 1,
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
    if (artifacts.length > 1) return manual('duplicate_marker_name');
    if (artifacts[0]?.expired) return manual('expired_marker');
    if (artifacts.length === 1) {
      evidence.markers.push({ artifact: artifacts[0] });
    }
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
  return classifyProductionMarkerEvidence(evidence);
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
