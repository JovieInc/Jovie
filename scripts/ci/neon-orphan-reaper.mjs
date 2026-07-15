#!/usr/bin/env node

const NEON_API = 'https://console.neon.tech/api/v2';
const GITHUB_API = process.env.GITHUB_API_URL || 'https://api.github.com';

export const EPHEMERAL_BRANCH_PATTERNS = [
  /^visual-regression-(?<runId>\d{8,})$/,
  /^e2e-full-(?<runId>\d{8,})-[a-z0-9._-]+$/i,
  /^nightly-e2e-(?<runId>\d{8,})$/,
  /^dashboard-lighthouse-(?<runId>\d{8,})-\d+$/,
  /^e2e-smoke-(?<runId>\d{8,})-\d+$/,
  /^golden-path-(?<runId>\d{8,})-\d+$/,
  /^admin-smoke-(?<runId>\d{8,})-\d+$/,
  /^ci-neon-run-(?<runId>\d{8,})-\d+$/,
  /^(?<ownerPrefix>[a-z0-9._-]+)-(?<runId>\d{8,})-\d+$/,
];

export function sanitizeLegacyHeadBranch(name) {
  return name
    .toLowerCase()
    .replaceAll('/', '-')
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function workflowRunOwnershipForBranch(name) {
  for (const pattern of EPHEMERAL_BRANCH_PATTERNS) {
    const match = pattern.exec(name);
    if (match?.groups?.runId) {
      return {
        runId: match.groups.runId,
        ownerPrefix: match.groups.ownerPrefix ?? null,
      };
    }
  }
  return null;
}

export function workflowRunIdForBranch(name) {
  return workflowRunOwnershipForBranch(name)?.runId ?? null;
}

export function isProvablyOrphaned({
  branch,
  workflowRun,
  currentRunId,
  protectedBranches,
}) {
  if (!branch?.id || !branch?.name) return false;
  if (protectedBranches.has(branch.name)) return false;

  const ownership = workflowRunOwnershipForBranch(branch.name);
  if (!ownership || ownership.runId === String(currentRunId || ''))
    return false;

  // A missing, malformed, inaccessible, queued, or active run is not proof.
  // GitHub reports `completed` only after every job and post-job cleanup ends.
  if (
    String(workflowRun?.id || '') !== ownership.runId ||
    workflowRun?.status !== 'completed'
  ) {
    return false;
  }

  return (
    !ownership.ownerPrefix ||
    sanitizeLegacyHeadBranch(String(workflowRun.head_branch || '')) ===
      ownership.ownerPrefix
  );
}

export async function proveCompletedWorkflowBranch({
  branchName,
  githubToken,
  repository,
  currentRunId,
  request = requestJson,
}) {
  const ownership = workflowRunOwnershipForBranch(branchName);
  if (!ownership) {
    return { proven: false, reason: 'ownership-unrecognized' };
  }
  if (ownership.runId === String(currentRunId || '')) {
    return { proven: false, reason: 'current-workflow-run' };
  }
  if (!githubToken || !repository) {
    return { proven: false, reason: 'github-proof-unavailable' };
  }

  let workflowRun;
  try {
    workflowRun = await request(
      `${GITHUB_API}/repos/${repository}/actions/runs/${ownership.runId}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${githubToken}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    );
  } catch {
    return { proven: false, reason: 'github-proof-unavailable' };
  }

  const proven = isProvablyOrphaned({
    branch: { id: branchName, name: branchName },
    workflowRun,
    currentRunId,
    protectedBranches: new Set(),
  });
  return {
    proven,
    reason: proven ? 'completed-owner' : 'owner-not-completed',
  };
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(
      `${options.method || 'GET'} ${url} returned ${response.status}`
    );
  }
  return response.status === 204 ? null : response.json();
}

export async function reapCompletedWorkflowBranches({
  neonApiKey,
  neonProjectId,
  githubToken,
  repository,
  currentRunId,
  protectedBranches = new Set(),
  maxDeletes = 5,
  request = requestJson,
  log = console.log,
}) {
  if (!neonApiKey || !neonProjectId || !githubToken || !repository) {
    log(
      'Neon orphan reaper skipped: required credentials or repository missing.'
    );
    return {
      deleted: [],
      skipped: ['missing-configuration'],
      active: 0,
      unknown: 1,
    };
  }

  let branches;
  let endpoints;
  try {
    const headers = { Authorization: `Bearer ${neonApiKey}` };
    const [branchPayload, endpointPayload] = await Promise.all([
      request(
        `${NEON_API}/projects/${encodeURIComponent(neonProjectId)}/branches?limit=100`,
        { headers }
      ),
      request(
        `${NEON_API}/projects/${encodeURIComponent(neonProjectId)}/endpoints?limit=100`,
        { headers }
      ),
    ]);
    branches = Array.isArray(branchPayload)
      ? branchPayload
      : branchPayload?.branches;
    endpoints = Array.isArray(endpointPayload)
      ? endpointPayload
      : endpointPayload?.endpoints;
  } catch (error) {
    log(
      `Neon orphan reaper failed closed while listing endpoint inventory: ${error.message}`
    );
    return {
      deleted: [],
      skipped: ['branch-list-unavailable'],
      active: 0,
      unknown: 1,
    };
  }

  if (!Array.isArray(branches) || !Array.isArray(endpoints)) {
    log('Neon orphan reaper failed closed: inventory response was malformed.');
    return {
      deleted: [],
      skipped: ['malformed-inventory'],
      active: 0,
      unknown: 1,
    };
  }

  const activeEndpointsByBranch = new Map();
  for (const endpoint of endpoints) {
    if (endpoint?.current_state !== 'active' || !endpoint?.branch_id) continue;
    activeEndpointsByBranch.set(
      endpoint.branch_id,
      (activeEndpointsByBranch.get(endpoint.branch_id) || 0) + 1
    );
  }
  const inventoriedBranchIds = new Set(
    branches.map(branch => branch?.id).filter(Boolean)
  );

  const candidates = branches.map(branch => ({
    branch,
    runId: workflowRunIdForBranch(branch.name),
  }));

  const deleted = [];
  const skipped = [];
  let active = 0;
  let unknown = [...activeEndpointsByBranch].reduce(
    (count, [branchId, endpointCount]) =>
      count + (inventoriedBranchIds.has(branchId) ? 0 : endpointCount),
    0
  );
  for (const { branch, runId } of candidates) {
    const activeEndpointCount = activeEndpointsByBranch.get(branch.id) || 0;
    if (protectedBranches.has(branch.name)) {
      unknown += activeEndpointCount;
      continue;
    }
    if (!runId) {
      skipped.push(branch.name);
      unknown += activeEndpointCount;
      log(
        `Keeping ${branch.name}: branch ownership is not machine-verifiable.`
      );
      continue;
    }
    if (runId === String(currentRunId || '')) {
      skipped.push(branch.name);
      active += activeEndpointCount;
      continue;
    }

    let workflowRun;
    try {
      workflowRun = await request(
        `${GITHUB_API}/repos/${repository}/actions/runs/${runId}`,
        {
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${githubToken}`,
            'X-GitHub-Api-Version': '2022-11-28',
          },
        }
      );
    } catch (error) {
      skipped.push(branch.name);
      unknown += activeEndpointCount;
      log(
        `Keeping ${branch.name}: workflow-run proof unavailable (${error.message}).`
      );
      continue;
    }

    if (
      !isProvablyOrphaned({
        branch,
        workflowRun,
        currentRunId,
        protectedBranches,
      })
    ) {
      skipped.push(branch.name);
      active += activeEndpointCount;
      log(`Keeping ${branch.name}: owning workflow run is not completed.`);
      continue;
    }

    if (deleted.length >= maxDeletes) {
      skipped.push(branch.name);
      unknown += activeEndpointCount;
      continue;
    }

    try {
      await request(
        `${NEON_API}/projects/${encodeURIComponent(neonProjectId)}/branches/${encodeURIComponent(branch.id)}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${neonApiKey}` },
        }
      );
      deleted.push(branch.name);
      log(
        `Deleted orphaned Neon branch ${branch.name} (completed run ${runId}).`
      );
    } catch (error) {
      skipped.push(branch.name);
      unknown += activeEndpointCount;
      log(`Keeping ${branch.name}: delete failed (${error.message}).`);
    }
  }

  return { deleted, skipped, active, unknown };
}

export async function awaitEndpointTeardown({
  inventory,
  maxAttempts,
  retrySeconds,
  sleep = milliseconds =>
    new Promise(resolve => setTimeout(resolve, milliseconds)),
  log = console.log,
}) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new TypeError('maxAttempts must be a positive integer.');
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await inventory();
    log(
      `Neon admission ${attempt}/${maxAttempts}: deleted=${result.deleted.length}, active=${result.active}, unknown=${result.unknown}`
    );
    // Neon acknowledges branch deletion before its endpoint necessarily leaves
    // the active inventory. Never create from the same pass that deleted;
    // admission requires a subsequent authoritative endpoint inventory.
    if (result.deleted.length === 0) return result;
    if (attempt === maxAttempts) {
      throw new Error(
        'Neon endpoint teardown was not confirmed by a subsequent endpoint inventory.'
      );
    }
    await sleep(retrySeconds * 1000);
  }
}

async function main() {
  if (process.argv[2] === '--prove-completed-owner') {
    const branchName = process.argv[3];
    if (!branchName) {
      console.error('Neon ownership proof requires a branch name.');
      process.exitCode = 2;
      return;
    }
    const result = await proveCompletedWorkflowBranch({
      branchName,
      githubToken: process.env.GITHUB_TOKEN,
      repository: process.env.GITHUB_REPOSITORY,
      currentRunId: process.env.GITHUB_RUN_ID,
    });
    if (!result.proven) {
      console.error(
        `Neon branch ${branchName} is not a proven completed workflow owner (${result.reason}); keeping it.`
      );
      process.exitCode = 1;
      return;
    }
    console.log(`Neon branch ${branchName} has a proven completed owner.`);
    return;
  }

  const protectedBranches = new Set(
    (
      process.env.PROTECTED_BRANCHES ||
      'main,development,preview,br-main,br-production'
    )
      .split(',')
      .map(value => value.trim())
      .filter(Boolean)
  );

  try {
    await awaitEndpointTeardown({
      inventory: () =>
        reapCompletedWorkflowBranches({
          neonApiKey: process.env.NEON_API_KEY,
          neonProjectId: process.env.NEON_PROJECT_ID,
          githubToken: process.env.GITHUB_TOKEN,
          repository: process.env.GITHUB_REPOSITORY,
          currentRunId: process.env.GITHUB_RUN_ID,
          protectedBranches,
        }),
      maxAttempts: Number(process.env.ADMISSION_ATTEMPTS || '12'),
      retrySeconds: Number(process.env.ADMISSION_RETRY_SECONDS || '15'),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `Neon orphan reaper failed closed before provider admission: ${message}`
    );
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
