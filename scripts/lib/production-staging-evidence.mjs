#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyProductLanes } from './product-lane-classifier.mjs';

const SHA = /^[0-9a-f]{40}$/;
const ID = /^[1-9][0-9]*$/;
const DEPLOYMENT = /^dpl_[A-Za-z0-9]+$/;

function requireProof(condition, message) {
  if (!condition) throw new Error(message);
}

function command(name, args) {
  const result = spawnSync(name, args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  requireProof(
    result.status === 0,
    `${name} failed while reading staging proof (exit=${result.status})`
  );
  return result.stdout;
}

function ghJson(path) {
  return JSON.parse(command('gh', ['api', path]));
}

function downloadReceipt(repository, artifactId) {
  const root = mkdtempSync(join(tmpdir(), 'jovie-staging-proof-'));
  try {
    const archive = join(root, 'receipt.zip');
    const result = spawnSync(
      'gh',
      ['api', `repos/${repository}/actions/artifacts/${artifactId}/zip`],
      { maxBuffer: 16 * 1024 * 1024 }
    );
    requireProof(result.status === 0, 'Staging receipt download failed');
    writeFileSync(archive, result.stdout);
    const entry = 'staging-deployment-receipt.json';
    requireProof(
      command('unzip', ['-Z1', archive]).trim() === entry,
      'Staging artifact contents are ambiguous'
    );
    return JSON.parse(command('unzip', ['-p', archive, entry]));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function listing(payload, key) {
  requireProof(
    Array.isArray(payload?.[key]) &&
      payload.total_count === payload[key].length,
    `Incomplete staging ${key} listing`
  );
  return payload[key];
}

function exactRun(run, { repository, sha, id, attempt, path, event }) {
  requireProof(
    String(run?.id) === String(id) &&
      String(run?.run_attempt) === String(attempt) &&
      run.head_sha === sha &&
      run.head_branch === 'main' &&
      run.path === path &&
      run.event === event &&
      run.head_repository?.full_name === repository &&
      run.status === 'completed' &&
      run.conclusion === 'success',
    'Staging proof lacks an exact successful workflow attempt'
  );
}

function exactJob(jobs, name, run, sha) {
  const matches = jobs.filter(job => job.name === name);
  requireProof(
    matches.length === 1 &&
      matches[0].run_id === run.id &&
      matches[0].run_attempt === run.run_attempt &&
      matches[0].head_sha === sha &&
      matches[0].status === 'completed' &&
      matches[0].conclusion === 'success',
    `Staging proof lacks successful ${name}`
  );
}

// webEvidenceSha proves CI for the latest web change; it need not have been
// staged separately. Select the actual staged descendant, bounded above by the
// immutable production target. The lane planner already proves its suffix is
// non-web. Never relabel that deployment as the historical CI evidence SHA.
export function inspectProductionStagingEvidence({
  repository,
  expectedSha,
  lowerBoundSha,
  identity,
  ghJsonImpl = ghJson,
  downloadReceiptImpl = downloadReceipt,
}) {
  requireProof(
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) &&
      SHA.test(expectedSha) &&
      (lowerBoundSha === null || SHA.test(lowerBoundSha)),
    'Invalid production staging lineage'
  );
  const sha = identity?.commitSha;
  requireProof(
    SHA.test(sha) &&
      DEPLOYMENT.test(identity?.deploymentId) &&
      identity.environment === 'preview',
    'Canonical staging identity is missing or invalid'
  );
  const compare = (base, head) =>
    base === head
      ? 'identical'
      : ghJsonImpl(`repos/${repository}/compare/${base}...${head}`).status;
  const upperProof =
    sha === expectedSha
      ? { status: 'identical', files: [] }
      : ghJsonImpl(`repos/${repository}/compare/${sha}...${expectedSha}`);
  const upper = upperProof.status;
  requireProof(
    ['ahead', 'identical'].includes(upper),
    'Staging SHA is outside the production target lineage'
  );
  // A live-unbound operations-only range retains the existing ancestor proof;
  // it has no new web evidence SHA to cover.
  const lower =
    lowerBoundSha === null ? 'identical' : compare(lowerBoundSha, sha);
  if (lower === 'behind')
    return {
      state: 'pending',
      sha,
      reason: 'staging precedes required web evidence',
    };
  requireProof(
    ['ahead', 'identical'].includes(lower),
    'Staging SHA does not include required web evidence'
  );

  // Git ancestry also admits side-branch merges. Prove the staged tree
  // covers every web change in the production target. GitHub caps compare
  // files at 300; a capped or unknown diff cannot establish this proof.
  requireProof(
    Array.isArray(upperProof.files) &&
      upperProof.files.length < 300 &&
      upperProof.files.every(
        file =>
          typeof file.filename === 'string' &&
          (!('previous_filename' in file) ||
            typeof file.previous_filename === 'string')
      ),
    'Staging-to-target changed paths are incomplete'
  );
  const suffixPaths = upperProof.files.flatMap(file =>
    file.previous_filename
      ? [file.filename, file.previous_filename]
      : [file.filename]
  );
  requireProof(
    !classifyProductLanes(suffixPaths).selectedLanes.includes('web'),
    'Staging deployment does not cover the production target web changes'
  );

  const name = `staging-deployment-${sha}`;
  const artifacts = listing(
    ghJsonImpl(
      `repos/${repository}/actions/artifacts?name=${name}&per_page=100`
    ),
    'artifacts'
  ).filter(artifact => artifact.expired === false && artifact.name === name);
  if (artifacts.length === 0)
    return { state: 'pending', sha, reason: 'exact staging receipt pending' };
  requireProof(
    artifacts.length === 1 && ID.test(String(artifacts[0].id)),
    'Staging artifacts are ambiguous'
  );
  const artifact = artifacts[0];
  const receipt = downloadReceiptImpl(repository, artifact.id);
  requireProof(
    receipt?.schema === 'jovie-staging-deployment/v1' &&
      receipt.repository === repository &&
      receipt.terminal === true &&
      ['current', 'superseded_after_mutation'].includes(receipt.state) &&
      receipt.sha === sha &&
      receipt.deploymentId === identity.deploymentId &&
      receipt.alias === 'staging.jov.ie' &&
      receipt.environment === 'preview' &&
      receipt.exactIdentity === 'passed' &&
      receipt.routeSmoke === 'passed' &&
      [
        receipt.sourceCiRunId,
        receipt.sourceCiRunAttempt,
        receipt.controllerRunId,
        receipt.controllerRunAttempt,
      ].every(value => ID.test(value)),
    'Staging receipt identity or verification is invalid'
  );
  // workflow_run executes at the default-branch revision, which can advance
  // after source CI began. Bind controller metadata to that distinct revision;
  // the receipt and exact source CI below still bind the deployed revision.
  const controllerSha = artifact.workflow_run?.head_sha;
  requireProof(
    String(artifact.workflow_run?.id) === receipt.controllerRunId &&
      SHA.test(controllerSha),
    'Staging artifact is not bound to its controller'
  );
  const controller = ghJsonImpl(
    `repos/${repository}/actions/runs/${receipt.controllerRunId}/attempts/${receipt.controllerRunAttempt}`
  );
  // The receipt can upload just before its controller settles.
  if (controller.status !== 'completed')
    return { state: 'pending', sha, reason: 'staging controller pending' };
  exactRun(controller, {
    repository,
    sha: controllerSha,
    id: receipt.controllerRunId,
    attempt: receipt.controllerRunAttempt,
    path: '.github/workflows/staging-controller.yml',
    event: 'workflow_run',
  });
  const jobs = listing(
    ghJsonImpl(
      `repos/${repository}/actions/runs/${controller.id}/attempts/${controller.run_attempt}/jobs?per_page=100`
    ),
    'jobs'
  );
  for (const name of [
    'Attest staging build provenance',
    'Canary Health Gate (staging) / Canary health gate',
    'Alias verified preview to staging.jov.ie',
    'Preserve exact staging deployment receipt',
  ]) {
    exactJob(jobs, `staging-release / ${name}`, controller, controllerSha);
  }
  const source = ghJsonImpl(
    `repos/${repository}/actions/runs/${receipt.sourceCiRunId}/attempts/${receipt.sourceCiRunAttempt}`
  );
  exactRun(source, {
    repository,
    sha,
    id: receipt.sourceCiRunId,
    attempt: receipt.sourceCiRunAttempt,
    path: '.github/workflows/ci.yml',
    event: 'push',
  });
  const sourceJobs = listing(
    ghJsonImpl(
      `repos/${repository}/actions/runs/${source.id}/attempts/${source.run_attempt}/jobs?per_page=100`
    ),
    'jobs'
  );
  exactJob(sourceJobs, 'Main Release Ready', source, sha);
  return {
    state: 'verified',
    sha,
    deploymentId: receipt.deploymentId,
    artifactId: artifact.id,
    sourceCiRunId: receipt.sourceCiRunId,
    controllerRunId: receipt.controllerRunId,
    controllerSha,
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const identity = JSON.parse(
      command('curl', [
        '--fail',
        '--silent',
        '--show-error',
        '--max-time',
        '20',
        'https://staging.jov.ie/api/health/build-info',
      ])
    );
    console.log(
      JSON.stringify(
        inspectProductionStagingEvidence({
          repository: process.env.REPOSITORY,
          expectedSha: process.env.EXPECTED_SHA,
          lowerBoundSha: process.env.STAGING_LOWER_BOUND_SHA || null,
          identity,
        })
      )
    );
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exitCode = 1;
  }
}
