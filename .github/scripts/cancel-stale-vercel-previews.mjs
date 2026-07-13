#!/usr/bin/env node

const API_BASE = 'https://api.vercel.com';
const ACTIVE_STATES = ['QUEUED', 'BUILDING'];
const MAX_CANCELLATIONS = 100;
export const DEFAULT_MIN_AGE_MS = 15 * 60 * 1000;

function requireValidMinAge(minAgeMs) {
  if (!Number.isFinite(minAgeMs) || minAgeMs < 0) {
    throw new Error('Vercel preview minimum age must be a non-negative number');
  }
}

export function isStalePreview(
  deployment,
  {
    projectId,
    now = Date.now(),
    minAgeMs = DEFAULT_MIN_AGE_MS,
    currentSha = '',
  }
) {
  requireValidMinAge(minAgeMs);
  const state = (deployment.readyState ?? deployment.state ?? '').toUpperCase();
  const createdAt = Number(deployment.createdAt ?? deployment.created);
  const deploymentSha = deployment.meta?.githubCommitSha ?? '';

  return (
    deployment.projectId === projectId &&
    deployment.target !== 'production' &&
    ACTIVE_STATES.includes(state) &&
    Number.isFinite(createdAt) &&
    createdAt > 0 &&
    now - createdAt >= minAgeMs &&
    (!currentSha || deploymentSha !== currentSha)
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
  minAgeMs = DEFAULT_MIN_AGE_MS,
  currentSha = '',
  now = Date.now(),
  request = vercelRequest,
}) {
  requireValidMinAge(minAgeMs);
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
        .filter(deployment =>
          isStalePreview(deployment, {
            projectId,
            minAgeMs,
            currentSha,
            now,
          })
        )
        .map(deployment => [deployment.uid ?? deployment.id, deployment])
    ).values(),
  ]
    .filter(deployment => deployment.uid ?? deployment.id)
    .slice(0, MAX_CANCELLATIONS);

  for (const deployment of stale) {
    const id = deployment.uid ?? deployment.id;
    const state = deployment.readyState ?? deployment.state;
    console.log(`Canceling active preview ${id} (${state})`);

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
  const currentSha = process.env.GITHUB_SHA ?? '';
  const minAgeMinutes = Number(
    process.env.VERCEL_PREVIEW_MIN_AGE_MINUTES ?? '15'
  );
  const missing = Object.entries({ token, orgId, projectId })
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(
      `Missing required queue-reaper inputs: ${missing.join(', ')}`
    );
  }

  if (!Number.isFinite(minAgeMinutes) || minAgeMinutes < 0) {
    throw new Error('VERCEL_PREVIEW_MIN_AGE_MINUTES must be non-negative');
  }

  await cancelStalePreviews({
    token,
    orgId,
    projectId,
    currentSha,
    minAgeMs: minAgeMinutes * 60 * 1000,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
