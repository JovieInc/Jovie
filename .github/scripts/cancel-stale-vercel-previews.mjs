#!/usr/bin/env node

const API_BASE = 'https://api.vercel.com';
const ACTIVE_STATES = ['QUEUED', 'BUILDING'];
const MAX_CANCELLATIONS = 100;

export function isStalePreview(deployment, { projectId }) {
  const commitSha = deployment.meta?.githubCommitSha;
  const commitRef = deployment.meta?.githubCommitRef;
  const state = (deployment.readyState ?? deployment.state ?? '').toUpperCase();

  return (
    deployment.projectId === projectId &&
    deployment.target !== 'production' &&
    ACTIVE_STATES.includes(state) &&
    commitRef === 'main' &&
    typeof commitSha === 'string' &&
    commitSha.length > 0
  );
}

function scopedUrl(path, orgId, params = {}) {
  const url = new URL(path, API_BASE);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  if (orgId.startsWith('team_')) url.searchParams.set('teamId', orgId);
  return url;
}

async function vercelRequest(url, token, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
    signal: AbortSignal.timeout(15_000),
  });

  return response;
}

export async function cancelStalePreviews({
  token,
  orgId,
  projectId,
  request = vercelRequest,
}) {
  const deployments = [];

  for (const state of ACTIVE_STATES) {
    const url = scopedUrl('/v7/deployments', orgId, {
      projectId,
      state,
      limit: 100,
    });
    const response = await request(url, token);
    if (!response.ok) {
      throw new Error(`Vercel deployment list failed (${response.status})`);
    }
    const payload = await response.json();
    deployments.push(...(payload.deployments ?? []));
  }

  const stale = [
    ...new Map(
      deployments
        .filter(deployment => isStalePreview(deployment, { projectId }))
        .map(deployment => [deployment.uid ?? deployment.id, deployment])
    ).values(),
  ]
    .filter(deployment => deployment.uid ?? deployment.id)
    .slice(0, MAX_CANCELLATIONS);

  for (const deployment of stale) {
    const id = deployment.uid ?? deployment.id;
    const commitSha = deployment.meta.githubCommitSha;
    const state = deployment.readyState ?? deployment.state;
    console.log(`Canceling stale preview ${id} (${state}, ${commitSha})`);

    const url = scopedUrl(
      `/v12/deployments/${encodeURIComponent(id)}/cancel`,
      orgId
    );
    const response = await request(url, token, { method: 'PATCH' });
    if (!response.ok && ![400, 404, 409].includes(response.status)) {
      throw new Error(
        `Vercel deployment cancel failed for ${id} (${response.status})`
      );
    }
    if (!response.ok) {
      console.log(
        `Preview ${id} was already terminal (${response.status}); continuing`
      );
      continue;
    }
    const payload = await response.json();
    if (
      (payload.readyState ?? payload.state ?? '').toUpperCase() !== 'CANCELED'
    ) {
      throw new Error(`Vercel did not confirm cancellation for ${id}`);
    }
  }

  console.log(`Canceled ${stale.length} stale Vercel preview deployment(s)`);
  return stale.map(deployment => deployment.uid ?? deployment.id);
}

async function main() {
  const token = process.env.VERCEL_TOKEN ?? '';
  const orgId = process.env.VERCEL_ORG_ID ?? '';
  const projectId = process.env.VERCEL_PROJECT_ID ?? '';
  const missing = Object.entries({ token, orgId, projectId })
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(
      `Missing required queue-reaper inputs: ${missing.join(', ')}`
    );
  }

  await cancelStalePreviews({ token, orgId, projectId });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
