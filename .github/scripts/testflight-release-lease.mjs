#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const SHA = /^[0-9a-f]{40}$/;
const ID = /^[1-9][0-9]*$/;
const POLICY = '.github/testflight-release-policy.json';
const INTENT = 'testflight-upload-intent';
const MAX_INTENT_BUCKETS = 64;
const MAX_INTENTS = 1000;
const TESTFLIGHT = '.github/workflows/ios-testflight.yml';
const CONTROLLER = '.github/workflows/production-controller.yml';
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const digest = value =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const epoch = value => {
  const n = Date.parse(value);
  assert(Number.isFinite(n), 'missing authoritative timestamp');
  return n;
};

// Bounded, complete listings: truncation, duplicate IDs and moving pagination
// cannot masquerade as absent evidence or an empty upload-intent history.
function listing(api, route, key) {
  const first = api(route);
  const count = first?.total_count;
  assert(
    Number.isSafeInteger(count) && count >= 0 && count <= 1000,
    'unbounded or malformed evidence listing'
  );
  const rows = [];
  for (let page = 1; page <= Math.max(1, Math.ceil(count / 100)); page++) {
    const result = page === 1 ? first : api(`${route}&page=${page}`);
    assert(
      result.total_count === count &&
        Array.isArray(result[key]) &&
        result[key].length === Math.min(100, count - rows.length),
      'incomplete evidence listing'
    );
    rows.push(...result[key]);
  }
  assert(
    rows.every(row => ID.test(String(row.id))) &&
      new Set(rows.map(row => row.id)).size === count,
    'ambiguous evidence identifiers'
  );
  return rows;
}

export function validateLease({
  repository,
  sourceSha,
  transportSha,
  workflowRun,
  workflowAttempt,
  controllerRun,
  controllerAttempt,
  baselineSha = '',
  previous = null,
  phase = 'admit',
  now = Date.now,
  api,
  readArtifact,
}) {
  const clock = typeof now === 'function' ? now : () => now;
  assert(
    ['admit', 'archive', 'upload'].includes(phase),
    'unknown release boundary'
  );
  assert(
    repository === 'JovieInc/Jovie' &&
      SHA.test(sourceSha) &&
      SHA.test(transportSha),
    'malformed release identity'
  );
  assert(
    ID.test(workflowRun) && ID.test(workflowAttempt),
    'malformed workflow attempt'
  );
  const base = `repos/${repository}`;
  const main = api(`${base}/commits/main`).sha;
  assert(SHA.test(main), 'unresolved authoritative main');
  const ancestor = (older, newer) => {
    assert(SHA.test(older) && SHA.test(newer), 'malformed lineage');
    if (older === newer) return;
    const comparison = api(`${base}/compare/${older}...${newer}`);
    assert(
      comparison.status === 'ahead' &&
        comparison.merge_base_commit?.sha === older,
      'release lineage rewound or diverged'
    );
  };
  ancestor(sourceSha, transportSha);
  ancestor(transportSha, main);
  const policyFile = api(`${base}/contents/${POLICY}?ref=${main}`);
  assert(
    policyFile.encoding === 'base64' && typeof policyFile.content === 'string',
    'missing current-main release policy'
  );
  const policy = JSON.parse(
    Buffer.from(policyFile.content, 'base64').toString('utf8')
  );
  assert(
    policy.schema === 'jovie-testflight-release-policy/v1' &&
      typeof policy.revision === 'string' &&
      policy.revision.length > 0 &&
      policy.maxCertificationAgeSeconds === 8400 &&
      typeof policy.blocked === 'boolean' &&
      Array.isArray(policy.revokedSources) &&
      policy.revokedSources.every(sha => SHA.test(sha)),
    'malformed release policy'
  );
  assert(
    !policy.blocked && !policy.revokedSources.includes(sourceSha),
    'certification revoked by current-main policy'
  );
  const workflow = api(`${base}/actions/workflows/ios-testflight.yml`);
  const run = api(`${base}/actions/runs/${workflowRun}`);
  const ownRun = value =>
    value?.id === Number(workflowRun) &&
    value.run_attempt === Number(workflowAttempt) &&
    value.workflow_id === workflow.id &&
    value.path === TESTFLIGHT &&
    ['workflow_run', 'workflow_dispatch'].includes(value.event) &&
    value.head_branch === 'main' &&
    value.head_sha === transportSha &&
    value.head_repository?.full_name === repository;
  assert(
    workflow.name === 'iOS TestFlight' &&
      workflow.path === TESTFLIGHT &&
      workflow.state === 'active' &&
      ownRun(run) &&
      run.status === 'in_progress',
    'inactive or mismatched TestFlight attempt'
  );

  const artifacts = listing(
    api,
    `${base}/actions/artifacts?name=production-generation-verified-${sourceSha}&per_page=100`,
    'artifacts'
  );
  const candidates = artifacts.filter(
    a =>
      a.name === `production-generation-verified-${sourceSha}` &&
      a.expired === false
  );
  assert(
    candidates.length === 1,
    'missing, expired or ambiguous production marker'
  );
  const artifact = candidates[0];
  const marker = readArtifact(
    artifact.id,
    'production-generation-verified.json'
  );
  assert(
    marker.sha === sourceSha &&
      ID.test(marker.controllerRun) &&
      ID.test(marker.controllerAttempt),
    'production marker source mismatch'
  );
  if (controllerRun)
    assert(
      controllerRun === marker.controllerRun &&
        controllerAttempt === marker.controllerAttempt,
      'production marker attempt mismatch'
    );
  controllerRun = marker.controllerRun;
  controllerAttempt = marker.controllerAttempt;
  const controller = api(`${base}/actions/runs/${controllerRun}`);
  const producer = api(
    `${base}/actions/runs/${controllerRun}/attempts/${controllerAttempt}`
  );
  const controllerWorkflow = api(
    `${base}/actions/workflows/production-controller.yml`
  );
  for (const value of [controller, producer]) {
    assert(
      value.id === Number(controllerRun) &&
        value.run_attempt === Number(controllerAttempt) &&
        value.workflow_id === controllerWorkflow.id &&
        value.path === CONTROLLER &&
        value.event === 'workflow_run' &&
        value.head_branch === 'main' &&
        value.head_repository?.full_name === repository &&
        value.status === 'completed' &&
        value.conclusion === 'success' &&
        SHA.test(value.head_sha),
      'changed, revoked or mismatched production attempt'
    );
  }
  assert(
    controllerWorkflow.name === 'Production Controller' &&
      controllerWorkflow.path === CONTROLLER &&
      controllerWorkflow.state === 'active' &&
      controller.head_sha === producer.head_sha &&
      artifact.workflow_run?.id === Number(controllerRun) &&
      artifact.workflow_run.head_sha === producer.head_sha,
    'production transport mismatch'
  );
  const title = producer.display_title?.match(
    /^Production Controller ([0-9a-f]{40}) from CI ([1-9][0-9]*) attempt ([1-9][0-9]*)$/
  );
  assert(
    title?.[1] === sourceSha,
    'certified source differs from controller provenance'
  );
  ancestor(sourceSha, producer.head_sha);
  ancestor(producer.head_sha, transportSha);
  const ci = api(`${base}/actions/runs/${title[2]}/attempts/${title[3]}`);
  const currentCi = api(`${base}/actions/runs/${title[2]}`);
  assert(
    currentCi.id === ci.id &&
      currentCi.run_attempt === ci.run_attempt &&
      currentCi.status === 'completed' &&
      currentCi.conclusion === 'success',
    'source CI changed or revoked'
  );
  const ciWorkflow = api(`${base}/actions/workflows/ci.yml`);
  assert(
    ci.id === Number(title[2]) &&
      ci.run_attempt === Number(title[3]) &&
      ci.workflow_id === ciWorkflow.id &&
      ciWorkflow.path === '.github/workflows/ci.yml' &&
      ci.path === ciWorkflow.path &&
      ci.head_sha === sourceSha &&
      ci.head_branch === 'main' &&
      ci.head_repository?.full_name === repository &&
      ci.event === 'push' &&
      ci.status === 'completed' &&
      ci.conclusion === 'success',
    'exact source CI was not successful'
  );
  const jobs = listing(
    api,
    `${base}/actions/runs/${controllerRun}/attempts/${controllerAttempt}/jobs?per_page=100`,
    'jobs'
  );
  const verified = jobs.filter(job => job.name === 'Production Verified');
  assert(
    verified.length === 1 &&
      verified[0].head_sha === producer.head_sha &&
      verified[0].status === 'completed' &&
      verified[0].conclusion === 'success',
    'missing exact Production Verified job'
  );
  const certifiedAt = epoch(verified[0].completed_at);
  const expiresAt = new Date(
    certifiedAt + policy.maxCertificationAgeSeconds * 1000
  ).toISOString();
  assert(
    clock() >= certifiedAt && clock() < Date.parse(expiresAt),
    'certification lease expired or future dated'
  );
  if (baselineSha) {
    ancestor(baselineSha, sourceSha);
    assert(baselineSha !== sourceSha, 'source already uploaded');
  }
  const lease = {
    schema: 'jovie-testflight-release-lease/v1',
    repository,
    sourceSha,
    transportSha,
    controllerTransportSha: producer.head_sha,
    controllerRun,
    controllerAttempt,
    sourceCiRun: title[2],
    sourceCiAttempt: title[3],
    workflowRun,
    workflowAttempt,
    markerArtifact: String(artifact.id),
    markerDigest: digest(marker),
    verifiedJob: String(verified[0].id),
    certifiedAt: new Date(certifiedAt).toISOString(),
    expiresAt,
    policyDigest: digest(policy),
    admissionMain: previous?.admissionMain ?? main,
    baselineSha,
    intentName: `${INTENT}-${baselineSha || 'bootstrap'}`,
  };
  if (previous) {
    ancestor(previous.admissionMain, main);
    assert(digest(previous) === digest(lease), 'pinned release lease changed');
  }
  // A successful source is a compaction watermark. Follow successor buckets
  // too: a delayed older receipt must not hide a later uncertain reservation.
  const buckets = [baselineSha];
  const visited = new Set();
  let intentCount = 0;
  let ownIntents = 0;
  while (buckets.length) {
    const bucket = buckets.shift();
    if (visited.has(bucket)) continue;
    visited.add(bucket);
    assert(visited.size <= MAX_INTENT_BUCKETS, 'upload intent traversal limit');
    const intentName = `${INTENT}-${bucket || 'bootstrap'}`;
    const intents = listing(
      api,
      `${base}/actions/artifacts?name=${intentName}&per_page=100`,
      'artifacts'
    );
    intentCount += intents.length;
    assert(intentCount <= MAX_INTENTS, 'upload intent history limit');
    for (const intent of intents) {
      assert(
        intent.name === intentName && intent.expired === false,
        'unreadable prior upload intent'
      );
      const prior = readArtifact(intent.id, 'testflight-release-lease.json');
      assert(
        prior.baselineSha === bucket &&
          prior.intentName === intentName &&
          prior.schema === lease.schema &&
          prior.repository === repository &&
          SHA.test(prior.sourceSha) &&
          SHA.test(prior.transportSha) &&
          prior.sourceSha !== bucket &&
          ID.test(prior.workflowRun) &&
          ID.test(prior.workflowAttempt) &&
          intent.workflow_run?.id === Number(prior.workflowRun),
        'malformed upload intent'
      );
      const priorRun = api(
        `${base}/actions/runs/${prior.workflowRun}/attempts/${prior.workflowAttempt}`
      );
      assert(
        priorRun.id === Number(prior.workflowRun) &&
          priorRun.run_attempt === Number(prior.workflowAttempt) &&
          priorRun.workflow_id === workflow.id &&
          priorRun.path === TESTFLIGHT &&
          priorRun.head_branch === 'main' &&
          priorRun.head_repository?.full_name === repository &&
          priorRun.head_sha === prior.transportSha,
        'upload intent transport mismatch'
      );
      if (
        prior.workflowRun === workflowRun &&
        prior.workflowAttempt === workflowAttempt
      ) {
        assert(
          digest(prior) === digest(lease),
          'upload intent source/transport mismatch'
        );
        ownIntents++;
      } else {
        ancestor(prior.sourceSha, sourceSha);
        assert(
          prior.sourceSha !== sourceSha,
          'duplicate or uncertain prior upload'
        );
      }
      buckets.push(prior.sourceSha);
    }
  }
  assert(
    phase === 'admit' ? ownIntents === 0 : ownIntents === 1,
    'missing or duplicate exact upload intent'
  );
  // A run's latest record may change during collection. Bind the attempt again.
  for (const [id, attempt] of [
    [controllerRun, controllerAttempt],
    [title[2], title[3]],
  ]) {
    const latest = api(`${base}/actions/runs/${id}`);
    assert(
      latest.id === Number(id) &&
        latest.run_attempt === Number(attempt) &&
        latest.status === 'completed' &&
        latest.conclusion === 'success',
      'certification authority changed during validation'
    );
  }
  for (const [path, expected] of [
    ['ios-testflight.yml', workflow],
    ['production-controller.yml', controllerWorkflow],
    ['ci.yml', ciWorkflow],
  ]) {
    const latest = api(`${base}/actions/workflows/${path}`);
    assert(
      latest.id === expected.id &&
        latest.path === expected.path &&
        latest.state === 'active',
      'certification workflow revoked during validation'
    );
  }
  const finalArtifact = api(`${base}/actions/artifacts/${artifact.id}`);
  assert(
    finalArtifact.id === artifact.id &&
      finalArtifact.name === artifact.name &&
      finalArtifact.expired === false &&
      finalArtifact.workflow_run?.id === Number(controllerRun),
    'production marker revoked during validation'
  );
  const finalMain = api(`${base}/commits/main`).sha;
  ancestor(main, finalMain);
  const finalPolicyFile = api(`${base}/contents/${POLICY}?ref=${finalMain}`);
  assert(
    finalPolicyFile.encoding === 'base64' &&
      typeof finalPolicyFile.content === 'string',
    'missing final release policy'
  );
  const finalPolicy = JSON.parse(
    Buffer.from(finalPolicyFile.content, 'base64').toString('utf8')
  );
  assert(
    digest(finalPolicy) === lease.policyDigest,
    'release policy changed during validation'
  );
  const finalRun = api(`${base}/actions/runs/${workflowRun}`);
  assert(
    ownRun(finalRun) && finalRun.status === 'in_progress',
    'TestFlight attempt changed during validation'
  );
  assert(
    clock() < Date.parse(lease.expiresAt),
    'certification expired during validation'
  );
  return lease;
}

function command(args, options = {}) {
  const result = spawnSync(args[0], args.slice(1), {
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  // No raw provider output: it can include sensitive request headers.
  assert(
    result.status === 0,
    `${args[0]} evidence command failed (${result.status ?? 'unavailable'})`
  );
  return result.stdout;
}

export function runLease(env = process.env, phase = process.argv[2]) {
  const directory = mkdtempSync(
    join(env.RUNNER_TEMP || tmpdir(), 'testflight-lease-')
  );
  try {
    const previous =
      phase === 'admit'
        ? null
        : JSON.parse(readFileSync(env.TESTFLIGHT_LEASE_PATH, 'utf8'));
    const lease = validateLease({
      repository: env.GITHUB_REPOSITORY,
      sourceSha: env.RELEASE_SHA,
      transportSha: env.TESTFLIGHT_TRANSPORT_SHA,
      workflowRun: env.GITHUB_RUN_ID,
      workflowAttempt: env.GITHUB_RUN_ATTEMPT,
      controllerRun: env.TRIGGER_RUN_ID || '',
      controllerAttempt: env.TRIGGER_RUN_ATTEMPT || '',
      baselineSha: env.BASELINE_SHA || '',
      previous,
      phase,
      api: route => JSON.parse(command(['gh', 'api', route])),
      readArtifact: (id, name) => {
        const zip = join(directory, `${id}.zip`);
        writeFileSync(
          zip,
          command(
            [
              'gh',
              'api',
              `repos/${env.GITHUB_REPOSITORY}/actions/artifacts/${id}/zip`,
            ],
            { encoding: 'buffer' }
          )
        );
        return JSON.parse(command(['unzip', '-p', zip, name]));
      },
    });
    assert(
      Date.now() < Date.parse(lease.expiresAt),
      'certification expired during validation'
    );
    if (phase === 'admit') {
      writeFileSync(env.TESTFLIGHT_LEASE_PATH, `${JSON.stringify(lease)}\n`);
      appendFileSync(env.GITHUB_OUTPUT, `lease=${JSON.stringify(lease)}\n`);
    } else {
      assert(
        command(['git', 'rev-parse', 'HEAD']).trim() === lease.sourceSha,
        'archive checkout differs from certified source'
      );
    }
    return lease;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    runLease();
  } catch (error) {
    console.error(`::error::TestFlight lease rejected: ${error.message}`);
    process.exitCode = 1;
  }
}
