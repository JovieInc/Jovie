#!/usr/bin/env node
// Cancel this Actions run only. The run id and repo come from the runner
// environment; argv cannot select another run (JOV-13106).
const runId = process.env.GITHUB_RUN_ID;
const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (
  !/^[1-9][0-9]*$/.test(runId ?? '') ||
  !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo ?? '') ||
  !token
) {
  console.error(
    'cancel-github-run: GITHUB_RUN_ID, GITHUB_REPOSITORY, and a token are required'
  );
  process.exit(1);
}

const response = await fetch(
  `https://api.github.com/repos/${repo}/actions/runs/${runId}/cancel`,
  {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'jovie-merge-group-fail-fast',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  }
);

// 202 accepted; 409 already cancelling (first companion won).
if (response.status === 202 || response.status === 409) process.exit(0);
console.error(`cancel-github-run: HTTP ${response.status}`);
process.exit(1);
