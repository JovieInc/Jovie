#!/usr/bin/env node

const API_BASE = 'https://api.vercel.com';
const ACTIVE_STATES = ['QUEUED', 'BUILDING'];
const ALREADY_TERMINAL_CANCEL_STATUSES = [400, 404, 409];
const MAX_CLEANUPS = 100;

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

export function previewsForRef(deployments, { projectId, ref }) {
  return (deployments ?? []).filter(
    deployment =>
      deployment?.projectId === projectId &&
      deployment?.target !== 'production' &&
      deployment?.meta?.githubCommitRef === ref
  );
}

export async function cleanupPreviewDeploymentsForRef({
  token,
  orgId,
  projectId,
  ref,
  now = Date.now(),
  request = vercelRequest,
}) {
  void now;
  const missing = Object.entries({ token, orgId, projectId, ref })
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(
      `Missing required preview-cleanup inputs: ${missing.join(', ')}`
    );
  }

  const listUrl = scopedUrl('/v6/deployments', orgId, {
    projectId,
    limit: 100,
  });
  const listResponse = await request(listUrl, token);
  if (!listResponse.ok) {
    throw new Error(`Vercel deployment list failed (${listResponse.status})`);
  }
  const payload = await listResponse.json();
  const previews = previewsForRef(payload.deployments ?? [], {
    projectId,
    ref,
  })
    .filter(deployment => deployment.uid ?? deployment.id)
    .slice(0, MAX_CLEANUPS);

  const canceled = [];
  const deleted = [];

  for (const deployment of previews) {
    const id = deployment.uid ?? deployment.id;
    const state = (
      deployment.readyState ??
      deployment.state ??
      ''
    ).toUpperCase();

    if (ACTIVE_STATES.includes(state)) {
      const url = scopedUrl(
        `/v12/deployments/${encodeURIComponent(id)}/cancel`,
        orgId
      );
      const response = await request(url, token, { method: 'PATCH' });
      if (
        !response.ok &&
        !ALREADY_TERMINAL_CANCEL_STATUSES.includes(response.status)
      ) {
        throw new Error(
          `Vercel deployment cancel failed for ${id} (${response.status})`
        );
      }
      if (!response.ok) {
        console.log(
          `Preview ${id} was already terminal (${response.status}); continuing`
        );
      } else {
        console.log(`Canceled active preview ${id} (${state})`);
      }
      canceled.push(id);
      continue;
    }

    const url = scopedUrl(`/v13/deployments/${encodeURIComponent(id)}`, orgId);
    const response = await request(url, token, { method: 'DELETE' });
    if (!response.ok && response.status !== 404) {
      throw new Error(
        `Vercel deployment delete failed for ${id} (${response.status})`
      );
    }
    if (response.status === 404) {
      console.log(`Preview ${id} was already deleted (404); continuing`);
    } else {
      console.log(`Deleted preview deployment ${id}`);
    }
    deleted.push(id);
  }

  console.log(
    `Preview cleanup for ref ${ref}: canceled=${canceled.length} deleted=${deleted.length}`
  );
  return { canceled, deleted };
}

async function main() {
  const token = process.env.VERCEL_TOKEN ?? '';
  const orgId = process.env.VERCEL_ORG_ID ?? '';
  const projectId = process.env.VERCEL_PROJECT_ID ?? '';
  const ref = process.env.PR_HEAD_REF ?? '';

  const result = await cleanupPreviewDeploymentsForRef({
    token,
    orgId,
    projectId,
    ref,
  });

  // The workflow tees stdout and parses this final JSON line as proof.
  console.log(JSON.stringify(result));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
