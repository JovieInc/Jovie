#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { classifyProductLanes } from './product-lane-classifier.mjs';

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const POSITIVE_INTEGER_PATTERN = /^[1-9][0-9]*$/;
const CI_WORKFLOW_PATH = '.github/workflows/ci.yml';
const MAX_FIRST_PARENT_COMMITS = 5000;

export const WEB_BIND_REASONS = Object.freeze({
  none: 'none',
  selectedLane: 'selected_lane',
  liveUnbound: 'live_unbound',
});

export const PRODUCTION_BASE_EVIDENCE = Object.freeze({
  verifiedMarker: 'verified-marker',
  canonicalBootstrap: 'canonical-live-bootstrap',
});

/**
 * Classify the already-serving production checkpoint used as the lower bound
 * of a new release range. A historical generation normally needs its durable
 * verified marker. The sole bootstrap exception is an exact canonical live
 * SHA that predates marker enforcement and differs from the new target. The
 * caller must have read that SHA from canonical build-info; the new target
 * still traverses the complete staging, canary, promotion, and verification
 * path and receives its own marker.
 */
export function classifyProductionBaseEvidence({
  markerState,
  deployedSha,
  currentSha,
}) {
  exactSha(deployedSha, 'deployedSha');
  exactSha(currentSha, 'currentSha');
  if (markerState === 'verified') {
    return PRODUCTION_BASE_EVIDENCE.verifiedMarker;
  }
  if (markerState === 'none' && deployedSha !== currentSha) {
    return PRODUCTION_BASE_EVIDENCE.canonicalBootstrap;
  }
  throw new Error(
    `production base evidence is not admissible (${markerState || 'missing'})`
  );
}

function exactSha(value, label) {
  if (!SHA_PATTERN.test(value ?? '')) {
    throw new Error(`${label} must be a full lowercase commit SHA`);
  }
  return value;
}

function positiveInteger(value, label) {
  const normalized = String(value ?? '');
  if (!POSITIVE_INTEGER_PATTERN.test(normalized)) {
    throw new Error(`${label} must be a positive integer`);
  }
  return Number(normalized);
}

function uniqueStrings(values, label) {
  if (
    !Array.isArray(values) ||
    values.some(value => typeof value !== 'string')
  ) {
    throw new Error(`${label} must be an array of strings`);
  }
  return [...new Set(values)];
}

/**
 * Route production from the complete, still-unreleased repository delta.
 * The latest commit whose canonical classification selects Web is sufficient
 * admission evidence: its combined-head gate included every earlier commit,
 * and every later first-parent commit is proven by classification not to touch
 * the Web product lane.
 *
 * Live bind is occupancy of current main on jov.ie, not "web files changed."
 * An iOS/Mac/operations-only range with deployedSha !== currentSha still
 * selects Web/Promote so skip-promote cannot fail-closed forever (JOV-5821).
 * Skip-promote remains fail-closed while unbound (JOV-5458 / JOV-5807).
 */
export function planProductionLaneRange({
  deployedSha,
  currentSha,
  cumulativeChangedPaths,
  commitsNewestFirst,
}) {
  exactSha(deployedSha, 'deployedSha');
  exactSha(currentSha, 'currentSha');
  const cumulativePaths = uniqueStrings(
    cumulativeChangedPaths,
    'cumulativeChangedPaths'
  );
  if (!Array.isArray(commitsNewestFirst)) {
    throw new Error('commitsNewestFirst must be an array');
  }
  if (commitsNewestFirst.length > MAX_FIRST_PARENT_COMMITS) {
    throw new Error(
      `first-parent production range exceeds ${MAX_FIRST_PARENT_COMMITS} commits`
    );
  }

  if (deployedSha === currentSha) {
    if (commitsNewestFirst.length !== 0 || cumulativePaths.length !== 0) {
      throw new Error(
        'an exact deployed current head must have an empty range'
      );
    }
  } else if (commitsNewestFirst.length === 0) {
    throw new Error('production range omitted current first-parent history');
  }

  for (let index = 0; index < commitsNewestFirst.length; index += 1) {
    const commit = commitsNewestFirst[index];
    exactSha(commit?.sha, `commitsNewestFirst[${index}].sha`);
    exactSha(commit?.firstParent, `commitsNewestFirst[${index}].firstParent`);
    uniqueStrings(
      commit?.changedPaths,
      `commitsNewestFirst[${index}].changedPaths`
    );
    const expectedSha =
      index === 0 ? currentSha : commitsNewestFirst[index - 1].firstParent;
    if (commit.sha !== expectedSha) {
      throw new Error('first-parent range is not contiguous');
    }
  }
  if (
    commitsNewestFirst.length > 0 &&
    commitsNewestFirst.at(-1).firstParent !== deployedSha
  ) {
    throw new Error('first-parent range does not terminate at deployedSha');
  }

  const cumulative = classifyProductLanes(cumulativePaths);
  const selectedWeb = cumulative.selectedLanes.includes('web');
  let runWeb = selectedWeb;
  let webEvidenceSha = null;
  /** @type {'none' | 'selected_lane' | 'live_unbound'} */
  let webBindReason = WEB_BIND_REASONS.none;
  if (selectedWeb) {
    const evidenceCommit = commitsNewestFirst.find(commit =>
      classifyProductLanes(commit.changedPaths).selectedLanes.includes('web')
    );
    if (!evidenceCommit) {
      throw new Error(
        'cumulative Web routing has no exact first-parent evidence head'
      );
    }
    webEvidenceSha = evidenceCommit.sha;
    webBindReason = WEB_BIND_REASONS.selectedLane;
  } else if (deployedSha !== currentSha) {
    // Sealed product-lane receipts stay honest (ios/mac/operations). Web still
    // runs so Production Release can bind jov.ie to current main.
    runWeb = true;
    webBindReason = WEB_BIND_REASONS.liveUnbound;
  }

  return {
    schemaVersion: 1,
    basis: 'last-verified-production..current-main',
    deployedSha,
    currentSha,
    commitCount: commitsNewestFirst.length,
    cumulativeChangedPaths: cumulative.changedPaths,
    selectedLanes: cumulative.selectedLanes,
    runWeb,
    webEvidenceSha,
    webBindReason,
  };
}

export function planProductionMarkerRecovery({
  deployedSha,
  currentSha,
  currentReceipt,
}) {
  exactSha(deployedSha, 'deployedSha');
  exactSha(currentSha, 'currentSha');
  if (deployedSha !== currentSha) {
    throw new Error(
      'marker recovery requires production to serve current main'
    );
  }
  if (
    !currentReceipt ||
    typeof currentReceipt !== 'object' ||
    currentReceipt.provenance?.sha !== currentSha ||
    currentReceipt.aggregatePassed !== true
  ) {
    throw new Error(
      'marker recovery receipt is not exact passing current main'
    );
  }
  const selectedLanes = uniqueStrings(
    currentReceipt.selectedLanes,
    'currentReceipt.selectedLanes'
  );
  const runWeb = selectedLanes.includes('web');
  return {
    schemaVersion: 1,
    basis: 'current-marker-recovery',
    deployedSha,
    currentSha,
    commitCount: 0,
    cumulativeChangedPaths: [],
    selectedLanes,
    runWeb,
    webEvidenceSha: runWeb ? currentSha : null,
    webBindReason: runWeb
      ? WEB_BIND_REASONS.selectedLane
      : WEB_BIND_REASONS.none,
  };
}

export function validateLaneEvidenceReceipt({
  receipt,
  expectedSha,
  expectedRunId,
  expectedRunAttempt,
  lane,
}) {
  exactSha(expectedSha, 'expectedSha');
  const runId = positiveInteger(expectedRunId, 'expectedRunId');
  const runAttempt = positiveInteger(expectedRunAttempt, 'expectedRunAttempt');
  if (
    !receipt ||
    typeof receipt !== 'object' ||
    receipt.provenance?.sha !== expectedSha ||
    String(receipt.provenance?.runId ?? '') !== String(runId) ||
    String(receipt.provenance?.runAttempt ?? '') !== String(runAttempt)
  ) {
    throw new Error('receipt provenance does not match the exact evidence run');
  }
  if (receipt.aggregatePassed !== true) {
    throw new Error('receipt aggregate admission did not pass');
  }
  if (
    !Array.isArray(receipt.selectedLanes) ||
    !receipt.selectedLanes.includes(lane)
  ) {
    throw new Error(`${lane} is absent from the selected receipt lanes`);
  }
  const admission = receipt.admissions?.[lane];
  if (
    admission?.selected !== true ||
    admission?.passed !== true ||
    !Array.isArray(admission.results) ||
    admission.results.length === 0 ||
    admission.results.some(result => result !== 'success')
  ) {
    throw new Error(`${lane} admission did not pass with exact results`);
  }
  return { sha: expectedSha, runId, runAttempt, lane };
}

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed: ${result.stderr || 'unknown error'}`
    );
  }
  return result.stdout;
}

function runBinary(command, args) {
  const result = spawnSync(command, args, {
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed: ${result.stderr?.toString('utf8') || 'unknown error'}`
    );
  }
  return result.stdout;
}

function gitPaths(args) {
  const output = runBinary('git', [...args, '-z']);
  return output.toString('utf8').split('\0').filter(Boolean);
}

export function collectProductionGitRange(deployedSha, currentSha) {
  exactSha(deployedSha, 'deployedSha');
  exactSha(currentSha, 'currentSha');
  const head = run('git', ['rev-parse', 'HEAD']).trim();
  if (head !== currentSha) {
    throw new Error(`checked-out HEAD ${head} is not currentSha ${currentSha}`);
  }
  const ancestry = spawnSync(
    'git',
    ['merge-base', '--is-ancestor', deployedSha, currentSha],
    { encoding: 'utf8' }
  );
  if (ancestry.status !== 0) {
    throw new Error(
      'verified production SHA is not an ancestor of current main'
    );
  }
  if (deployedSha === currentSha) {
    return { cumulativeChangedPaths: [], commitsNewestFirst: [] };
  }

  const lines = run('git', [
    'rev-list',
    '--first-parent',
    '--parents',
    `${deployedSha}..${currentSha}`,
  ])
    .trim()
    .split('\n')
    .filter(Boolean);
  if (lines.length > MAX_FIRST_PARENT_COMMITS) {
    throw new Error(
      `first-parent production range exceeds ${MAX_FIRST_PARENT_COMMITS} commits`
    );
  }
  const commitsNewestFirst = lines.map((line, index) => {
    const [sha, firstParent] = line.split(' ');
    if (!sha || !firstParent) {
      throw new Error(`first-parent history entry ${index} is malformed`);
    }
    return {
      sha,
      firstParent,
      changedPaths: gitPaths([
        'diff',
        '--name-only',
        '--find-renames',
        firstParent,
        sha,
      ]),
    };
  });
  return {
    cumulativeChangedPaths: gitPaths([
      'diff',
      '--name-only',
      '--find-renames',
      deployedSha,
      currentSha,
    ]),
    commitsNewestFirst,
  };
}

function ghJson(endpoint) {
  return JSON.parse(run('gh', ['api', endpoint]));
}

function exactListing(payload, label, key) {
  if (
    !payload ||
    typeof payload !== 'object' ||
    !Number.isSafeInteger(payload.total_count) ||
    !Array.isArray(payload[key]) ||
    payload.total_count !== payload[key].length
  ) {
    throw new Error(`GitHub returned an incomplete ${label} listing`);
  }
  return payload[key];
}

function downloadFinalReceipt(repository, artifactId) {
  const root = mkdtempSync(join(tmpdir(), 'jovie-product-lane-evidence-'));
  const archive = join(root, 'artifact.zip');
  try {
    writeFileSync(
      archive,
      runBinary('gh', [
        'api',
        `repos/${repository}/actions/artifacts/${artifactId}/zip`,
      ])
    );
    const entries = run('unzip', ['-Z1', archive])
      .split('\n')
      .filter(Boolean)
      .sort();
    if (entries.join(',') !== 'final.json,final.md') {
      throw new Error(
        `lane artifact ${artifactId} does not contain exactly final.json and final.md`
      );
    }
    return JSON.parse(run('unzip', ['-p', archive, 'final.json']));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function validateRun(runRecord, repository, sha, event) {
  return (
    runRecord &&
    Number.isSafeInteger(runRecord.id) &&
    runRecord.id > 0 &&
    Number.isSafeInteger(runRecord.run_attempt) &&
    runRecord.run_attempt > 0 &&
    runRecord.event === event &&
    runRecord.head_sha === sha &&
    runRecord.path === CI_WORKFLOW_PATH &&
    runRecord.head_repository?.full_name === repository &&
    runRecord.status === 'completed' &&
    runRecord.conclusion === 'success' &&
    (event !== 'push' || runRecord.head_branch === 'main')
  );
}

function hasExactGate(jobs, runRecord, sha, gateName) {
  const exact = jobs.filter(
    job =>
      job?.name === gateName &&
      job.run_id === runRecord.id &&
      job.run_attempt === runRecord.run_attempt &&
      job.head_sha === sha &&
      job.status === 'completed' &&
      job.conclusion === 'success'
  );
  return exact.length === 1;
}

export function resolveHistoricalLaneEvidence({
  repository,
  sha,
  lane,
  ghJsonImpl = ghJson,
  downloadFinalReceiptImpl = downloadFinalReceipt,
}) {
  exactSha(sha, 'historical evidence SHA');
  const candidates = [];
  for (const [event, gateName] of [
    ['merge_group', 'PR Ready'],
    ['push', 'Main Release Ready'],
  ]) {
    const query = new URLSearchParams({
      event,
      head_sha: sha,
      status: 'completed',
      per_page: '100',
    });
    const listing = ghJsonImpl(
      `repos/${repository}/actions/workflows/ci.yml/runs?${query}`
    );
    for (const runRecord of listing.workflow_runs ?? []) {
      if (!validateRun(runRecord, repository, sha, event)) continue;
      const jobs = exactListing(
        ghJsonImpl(
          `repos/${repository}/actions/runs/${runRecord.id}/attempts/${runRecord.run_attempt}/jobs?per_page=100`
        ),
        'exact CI jobs',
        'jobs'
      );
      if (!hasExactGate(jobs, runRecord, sha, gateName)) continue;
      const artifacts = exactListing(
        ghJsonImpl(
          `repos/${repository}/actions/runs/${runRecord.id}/artifacts?per_page=100`
        ),
        'exact CI artifacts',
        'artifacts'
      );
      const expectedName = `product-lane-final-${sha}-${runRecord.run_attempt}`;
      const matchingArtifacts = artifacts.filter(
        artifact =>
          artifact?.expired === false && artifact.name === expectedName
      );
      if (matchingArtifacts.length !== 1) continue;
      const receipt = downloadFinalReceiptImpl(
        repository,
        matchingArtifacts[0].id
      );
      validateLaneEvidenceReceipt({
        receipt,
        expectedSha: sha,
        expectedRunId: runRecord.id,
        expectedRunAttempt: runRecord.run_attempt,
        lane,
      });
      candidates.push({
        sha,
        lane,
        event,
        runId: runRecord.id,
        runAttempt: runRecord.run_attempt,
        artifactId: matchingArtifacts[0].id,
        artifactName: matchingArtifacts[0].name,
      });
    }
  }
  if (candidates.length !== 1) {
    throw new Error(
      `expected one exact passing ${lane} receipt for ${sha}; found ${candidates.length}`
    );
  }
  return candidates[0];
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) throw new Error(`Unexpected argument: ${item}`);
    const [key, inlineValue] = item.slice(2).split('=', 2);
    const value = inlineValue ?? argv[index + 1];
    if (inlineValue === undefined) index += 1;
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }
    values[key] = value;
  }
  return values;
}

export function runProductionLaneRange(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  for (const name of [
    'repo',
    'deployed-sha',
    'current-sha',
    'current-receipt',
    'json-out',
  ]) {
    if (!args[name]) throw new Error(`--${name} is required`);
  }
  const mode = args.mode ?? 'range';
  if (!['range', 'marker-recovery'].includes(mode)) {
    throw new Error('--mode must be range or marker-recovery');
  }
  let currentReceipt;
  let plan;
  if (mode === 'marker-recovery') {
    collectProductionGitRange(args['deployed-sha'], args['current-sha']);
    currentReceipt = JSON.parse(readFileSync(args['current-receipt'], 'utf8'));
    plan = planProductionMarkerRecovery({
      deployedSha: args['deployed-sha'],
      currentSha: args['current-sha'],
      currentReceipt,
    });
  } else {
    const baseEvidence = classifyProductionBaseEvidence({
      markerState: args['deployed-marker-state'],
      deployedSha: args['deployed-sha'],
      currentSha: args['current-sha'],
    });
    const gitRange = collectProductionGitRange(
      args['deployed-sha'],
      args['current-sha']
    );
    plan = planProductionLaneRange({
      deployedSha: args['deployed-sha'],
      currentSha: args['current-sha'],
      ...gitRange,
    });
    plan.productionBaseEvidence = baseEvidence;
  }

  let webEvidence = null;
  if (plan.runWeb && plan.webBindReason === WEB_BIND_REASONS.liveUnbound) {
    webEvidence = {
      sha: plan.currentSha,
      lane: 'web',
      source: 'live-unbound-bind',
      selectedLanes: plan.selectedLanes,
    };
  } else if (plan.runWeb) {
    if (plan.webEvidenceSha === plan.currentSha) {
      currentReceipt ??= JSON.parse(
        readFileSync(args['current-receipt'], 'utf8')
      );
      const validated = validateLaneEvidenceReceipt({
        receipt: currentReceipt,
        expectedSha: plan.currentSha,
        expectedRunId: currentReceipt.provenance?.runId,
        expectedRunAttempt: currentReceipt.provenance?.runAttempt,
        lane: 'web',
      });
      webEvidence = {
        ...validated,
        source:
          mode === 'marker-recovery'
            ? 'current-marker-recovery-receipt'
            : 'current-main-release-receipt',
      };
    } else {
      webEvidence = {
        ...resolveHistoricalLaneEvidence({
          repository: args.repo,
          sha: plan.webEvidenceSha,
          lane: 'web',
        }),
        source: 'historical-exact-ci-receipt',
      };
    }
  }

  const output = { ...plan, webEvidence };
  writeFileSync(args['json-out'], `${JSON.stringify(output, null, 2)}\n`);
  if (args['github-output']) {
    writeFileSync(
      args['github-output'],
      [
        `selected_lanes=${plan.selectedLanes.join(',') || 'none'}`,
        `run_web=${plan.runWeb}`,
        `web_bind_reason=${plan.webBindReason}`,
        `deployed_sha=${plan.deployedSha}`,
        `web_evidence_sha=${plan.webEvidenceSha ?? 'none'}`,
      ].join('\n') + '\n',
      { flag: 'a' }
    );
  }
  process.stdout.write(
    `Production lane range ${plan.deployedSha}..${plan.currentSha}: ${plan.selectedLanes.join(',') || 'none'}; Web=${plan.runWeb}; bind=${plan.webBindReason}; evidence=${plan.webEvidenceSha ?? 'none'}\n`
  );
  return output;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    runProductionLaneRange();
  } catch (error) {
    console.error(
      `Production lane range failed: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  }
}
