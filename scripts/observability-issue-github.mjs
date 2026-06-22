#!/usr/bin/env node

import {
  buildObservabilityIssuePayload,
  mergeObservabilityIssue,
} from './observability-issue-sync.mjs';

const GITHUB_API = 'https://api.github.com';

export async function syncObservabilityIssue({
  token,
  owner,
  repo,
  report,
  occurrenceDelta = 1,
  fetchImpl = fetch,
}) {
  const payload = buildObservabilityIssuePayload(report, occurrenceDelta);
  const existing = await findIssueByFingerprint({
    token,
    owner,
    repo,
    fingerprintLabel: payload.fingerprintLabel,
    fetchImpl,
  });

  if (!existing) {
    const created = await createIssue({
      token,
      owner,
      repo,
      title: payload.title,
      body: payload.body,
      labels: payload.labels,
      fetchImpl,
    });

    return {
      action: 'created',
      issueNumber: created.number,
      occurrenceCount: occurrenceDelta,
      fingerprint: payload.fingerprint,
    };
  }

  const merged = mergeObservabilityIssue(existing, occurrenceDelta);
  await updateIssueBody({
    token,
    owner,
    repo,
    issueNumber: merged.number,
    body: merged.body,
    fetchImpl,
  });

  return {
    action: 'updated',
    issueNumber: merged.number,
    occurrenceCount: merged.occurrenceCount,
    fingerprint: payload.fingerprint,
  };
}

async function findIssueByFingerprint({
  token,
  owner,
  repo,
  fingerprintLabel,
  fetchImpl,
}) {
  const query = encodeURIComponent(
    `repo:${owner}/${repo} is:issue label:"${fingerprintLabel}" in:title,body`
  );
  const response = await githubRequest({
    token,
    path: `/search/issues?q=${query}`,
    fetchImpl,
  });

  const items = response.items ?? [];
  return (
    items.find(item =>
      item.labels?.some(label => label.name === fingerprintLabel)
    ) ?? null
  );
}

async function createIssue({
  token,
  owner,
  repo,
  title,
  body,
  labels,
  fetchImpl,
}) {
  return githubRequest({
    token,
    path: `/repos/${owner}/${repo}/issues`,
    method: 'POST',
    body: { title, body, labels },
    fetchImpl,
  });
}

async function updateIssueBody({
  token,
  owner,
  repo,
  issueNumber,
  body,
  fetchImpl,
}) {
  return githubRequest({
    token,
    path: `/repos/${owner}/${repo}/issues/${issueNumber}`,
    method: 'PATCH',
    body: { body },
    fetchImpl,
  });
}

async function githubRequest({ token, path, method = 'GET', body, fetchImpl }) {
  const response = await fetchImpl(`${GITHUB_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'jovie-observability-issue-sync',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `GitHub API ${method} ${path} failed: ${response.status} ${errorText}`
    );
  }

  return response.json();
}

async function main() {
  const token = process.env.GH_TOKEN;
  const owner = process.env.GITHUB_REPOSITORY_OWNER ?? 'JovieInc';
  const repo = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'Jovie';
  const payload = process.env.OBSERVABILITY_PAYLOAD;

  if (!token || !payload) {
    throw new Error('GH_TOKEN and OBSERVABILITY_PAYLOAD are required.');
  }

  const report = JSON.parse(payload);
  const occurrenceDelta = Number.parseInt(
    process.env.OCCURRENCE_DELTA ?? `${report.occurrence_delta ?? 1}`,
    10
  );

  const result = await syncObservabilityIssue({
    token,
    owner,
    repo,
    report,
    occurrenceDelta,
  });

  console.log(JSON.stringify(result));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
