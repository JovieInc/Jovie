#!/usr/bin/env node

import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SHA = /^[a-f0-9]{40}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const CI_WORKFLOW_ID = 178737329;
const CI_WORKFLOW_PATH = '.github/workflows/ci.yml';

/**
 * @param {string} path
 * @param {{token?: string, fetchImpl?: typeof fetch}} [options]
 */
async function githubRequest(path, { token, fetchImpl = fetch } = {}) {
  const apiUrl = (
    process.env.GITHUB_API_URL || 'https://api.github.com'
  ).replace(/\/$/, '');
  const response = await fetchImpl(`${apiUrl}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error('GitHub returned invalid JSON');
  }
  if (!response.ok)
    throw new Error(`GitHub API request failed (${response.status})`);
  return { data, link: response.headers.get('link') };
}

function writeResult(outputPath, appendFile, result) {
  if (!outputPath) return;
  appendFile(
    outputPath,
    [
      `eligible=${result.eligible}`,
      `reason=${result.reason}`,
      ...(result.prNumber ? [`pr_number=${result.prNumber}`] : []),
      ...(result.headSha ? [`head_sha=${result.headSha}`] : []),
      ...(result.prUrl ? [`pr_url=${result.prUrl}`] : []),
    ].join('\n') + '\n',
    'utf8'
  );
}

/**
 * Adapt a successful CI workflow_run event for the existing fetch-metadata
 * action. API-read PR state and the run's exact head are bound before the
 * runner-only event file is rewritten; no PR code or artifacts are consumed.
 * @param {{eventPath?: string, repository?: string, expectedHead?: string,
 *   token?: string, outputPath?: string}} [options]
 * @param {{readFile?: (path: string, encoding: 'utf8') => string,
 *   writeFile?: (path: string, data: string, encoding: 'utf8') => void,
 *   appendFile?: (path: string, data: string, encoding: 'utf8') => void,
 *   request?: (path: string, options: {token: string}) => Promise<{data: unknown, link?: string|null}>}} [dependencies]
 */
export async function adaptDependabotWorkflowRunEvent(
  options = {},
  dependencies = {}
) {
  const {
    eventPath = process.env.GITHUB_EVENT_PATH,
    repository = process.env.GITHUB_REPOSITORY,
    expectedHead = process.env.WORKFLOW_RUN_HEAD_SHA,
    token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN,
    outputPath = process.env.GITHUB_OUTPUT,
  } = options;
  const readFile = dependencies.readFile ?? readFileSync;
  const writeFile = dependencies.writeFile ?? writeFileSync;
  const appendFile = dependencies.appendFile ?? appendFileSync;
  const request = dependencies.request ?? githubRequest;
  const finish = result => {
    writeResult(outputPath, appendFile, result);
    return result;
  };

  if (
    !eventPath ||
    !REPOSITORY.test(repository ?? '') ||
    !SHA.test(expectedHead ?? '') ||
    !token
  )
    return finish({ eligible: false, reason: 'workflow-run-identity-invalid' });

  let payload;
  try {
    payload = JSON.parse(readFile(eventPath, 'utf8'));
  } catch {
    return finish({
      eligible: false,
      reason: 'workflow-run-payload-unavailable',
    });
  }
  const run = payload?.workflow_run;
  if (
    payload?.action !== 'completed' ||
    run?.name !== 'CI' ||
    run?.workflow_id !== CI_WORKFLOW_ID ||
    run?.event !== 'pull_request' ||
    run?.conclusion !== 'success' ||
    run?.head_sha !== expectedHead
  ) {
    return finish({ eligible: false, reason: 'workflow-run-not-eligible' });
  }
  const sameRepository = value =>
    typeof value === 'string' &&
    value.toLowerCase() === repository.toLowerCase();
  if (
    !sameRepository(payload.repository?.full_name) ||
    !sameRepository(run.repository?.full_name) ||
    !sameRepository(run.head_repository?.full_name)
  ) {
    return finish({
      eligible: false,
      reason: 'workflow-run-repository-mismatch',
    });
  }

  const [owner, name] = repository.split('/');
  let workflow;
  try {
    workflow = await request(
      `/repos/${owner}/${name}/actions/workflows/${CI_WORKFLOW_ID}`,
      { token }
    );
  } catch {
    return finish({
      eligible: false,
      reason: 'canonical-ci-workflow-unavailable',
    });
  }
  if (
    workflow?.data?.id !== CI_WORKFLOW_ID ||
    workflow.data.name !== 'CI' ||
    workflow.data.path !== CI_WORKFLOW_PATH ||
    workflow.data.state !== 'active'
  ) {
    return finish({
      eligible: false,
      reason: 'canonical-ci-workflow-mismatch',
    });
  }

  let associated;
  try {
    associated = await request(
      `/repos/${owner}/${name}/commits/${expectedHead}/pulls?per_page=100`,
      { token }
    );
  } catch {
    return finish({
      eligible: false,
      reason: 'pull-request-association-unavailable',
    });
  }
  if (
    !Array.isArray(associated?.data) ||
    /rel="next"/.test(associated.link ?? '')
  ) {
    return finish({
      eligible: false,
      reason: 'pull-request-association-incomplete',
    });
  }
  if (associated.data.length !== 1) {
    return finish({
      eligible: false,
      reason:
        associated.data.length === 0
          ? 'no-associated-pull-request'
          : 'multiple-associated-pull-requests',
    });
  }

  const pr = associated.data[0];
  if (!Number.isSafeInteger(pr?.number) || pr.number < 1)
    return finish({ eligible: false, reason: 'pull-request-identity-invalid' });
  if (pr.user?.login !== 'dependabot[bot]')
    return finish({ eligible: false, reason: 'author-not-dependabot' });
  if (pr.state !== 'open' || pr.draft !== false)
    return finish({ eligible: false, reason: 'pull-request-not-open-ready' });
  if (pr.base?.ref !== 'main' || !sameRepository(pr.base?.repo?.full_name))
    return finish({ eligible: false, reason: 'pull-request-base-mismatch' });
  if (!sameRepository(pr.head?.repo?.full_name))
    return finish({ eligible: false, reason: 'fork-head-not-eligible' });
  if (pr.head?.sha !== expectedHead)
    return finish({ eligible: false, reason: 'stale-head' });
  if (!Array.isArray(pr.labels) || typeof pr.head?.ref !== 'string')
    return finish({
      eligible: false,
      reason: 'pull-request-evidence-incomplete',
    });

  const adaptedPayload = {
    ...payload,
    pull_request: pr,
  };
  try {
    writeFile(eventPath, JSON.stringify(adaptedPayload), 'utf8');
  } catch {
    return finish({ eligible: false, reason: 'event-adaptation-write-failed' });
  }
  return finish({
    eligible: true,
    reason: 'exact-dependabot-pull-request-bound',
    prNumber: pr.number,
    headSha: expectedHead,
    prUrl: pr.html_url,
  });
}

export async function runDependabotWorkflowRunAdapterCli({
  isEntryPoint = Boolean(process.argv[1]) &&
    import.meta.url === pathToFileURL(process.argv[1]).href,
  adapt = adaptDependabotWorkflowRunEvent,
  log = console.log,
} = {}) {
  if (!isEntryPoint) return;
  const result = await adapt();
  log(JSON.stringify(result));
}

void runDependabotWorkflowRunAdapterCli();
