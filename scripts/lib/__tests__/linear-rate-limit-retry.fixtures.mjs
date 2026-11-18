import { mkdtempSync, rmSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, beforeEach, expect, vi } from 'vitest';
import { clearRemediationLabelCache } from '../linear-issue-intake.mjs';
export const NOW = 1_795_000_000_000;
export function installRetryFixture() {
  let testDirectory;

  beforeEach(() => {
    testDirectory = mkdtempSync(join(tmpdir(), 'linear-rate-limit-retry-'));
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    vi.stubEnv('LINEAR_API_KEY', `lin_api_fixture_${basename(testDirectory)}`);
    vi.stubEnv('REMEDIATION_TRIGGERS_DISABLED', '');
    vi.stubEnv('LINEAR_COOLDOWN_STATE_DIR', join(testDirectory, 'cooldown'));
    vi.stubEnv('LINEAR_COOLDOWN_FALLBACK_DIR', join(testDirectory, 'fallback'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    rmSync(testDirectory, { recursive: true, force: true });
  });
  return () => testDirectory;
}
export function response(status, body, headers = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return new Response(text, {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

export function fetchImpl(routes) {
  return async url => {
    const href = String(url);
    const route = Object.entries(routes).find(([needle]) =>
      href.includes(needle)
    );
    if (!route) throw new Error(`unexpected ${href}`);
    return response(route[1].status, route[1].body, route[1].headers);
  };
}

export function summaryEnv(run, testDirectory) {
  const summaryPath = join(testDirectory, 'summary.md');
  vi.stubEnv('GITHUB_STEP_SUMMARY', summaryPath);
  return Promise.resolve(run()).finally(() => {
    vi.unstubAllEnvs();
    rmSync(summaryPath, { force: true });
  });
}

export async function captureWarnings(run) {
  const warnings = [];
  const original = console.warn;
  console.warn = message => warnings.push(String(message));
  try {
    return { result: await run(), warnings };
  } finally {
    console.warn = original;
  }
}

export const ISSUE = {
  id: 'fixture-synthetic-issue',
  identifier: 'JOV-FIXTURE',
  url: 'https://linear.example/issue/JOV-FIXTURE',
  title: 'P0: synthetic monitoring failed (synthetic-monitoring)',
  state: { id: 'state-open', name: 'Todo', type: 'unstarted' },
  labels: {
    nodes: [
      { id: 'label-synthetic', name: 'remediation:synthetic-monitoring' },
    ],
  },
};
export const env = {
  TEST_STATUS: 'failed',
  FAILED_TESTS: 'fixture regression test crashed',
  PREVIOUS_CONCLUSION: 'failure',
  GITHUB_RUN_ID: 'fixture-run-24796',
};

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

export function syntheticFixture() {
  let exists = false;
  const counts = { created: 0, updated: 0, comments: 0 };
  const fetchImpl = vi.fn(async (url, init) => {
    expect(String(url)).toBe('https://api.linear.app/graphql');
    const { query, variables } = JSON.parse(init.body);
    if (query.includes('FindIssueByFingerprint')) {
      return json({
        data: {
          team: { states: { nodes: [] }, labels: ISSUE.labels },
          issues: { nodes: exists ? [ISSUE] : [] },
        },
      });
    }
    if (query.includes('FindIssueByRemediationLabel')) {
      return json({ data: { issues: { nodes: exists ? [ISSUE] : [] } } });
    }
    if (query.includes('CreateDedupedLinearIssue')) {
      expect(exists).toBe(false);
      counts.created += 1;
      exists = true;
      return json({ data: { issueCreate: { success: true, issue: ISSUE } } });
    }
    if (query.includes('UpdateDedupedLinearIssue')) {
      expect(variables.id).toBe(ISSUE.id);
      counts.updated += 1;
      return json({ data: { issueUpdate: { success: true, issue: ISSUE } } });
    }
    if (query.includes('AddLinearIssueComment')) {
      expect(variables.id).toBe(ISSUE.id);
      counts.comments += 1;
      return counts.comments === 1
        ? json({}, 429, { 'retry-after': '3600' })
        : json({
            data: {
              commentCreate: { success: true, comment: { id: 'comment-1' } },
            },
          });
    }
    throw new Error(`unexpected fixture GraphQL operation: ${query}`);
  });
  return { counts, fetchImpl };
}

export function installPartialProgressFixture() {
  let directory;
  let warnings;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'synthetic-partial-'));
    vi.stubEnv(
      'LINEAR_API_KEY',
      `lin_api_fixture_${directory.split('/').at(-1)}`
    );
    vi.stubEnv('REMEDIATION_TRIGGERS_DISABLED', '');
    vi.stubEnv('LINEAR_COOLDOWN_STATE_DIR', join(directory, 'cooldown'));
    vi.stubEnv('LINEAR_COOLDOWN_FALLBACK_DIR', join(directory, 'fallback'));
    vi.stubEnv('GITHUB_STEP_SUMMARY', join(directory, 'summary.md'));
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error('live network forbidden');
      })
    );
    warnings = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    clearRemediationLabelCache();
  });

  afterEach(async () => {
    vi.useRealTimers();
    clearRemediationLabelCache();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  });

  return { directory: () => directory, warnings: () => warnings };
}

export async function fetchCommentFailure(url, init) {
  const query = String(JSON.parse(init?.body ?? '{}')?.query ?? '');
  if (query.includes('FindIssueByFingerprint'))
    return response(200, {
      data: {
        team: { states: { nodes: [] }, labels: { nodes: [] } },
        issues: { nodes: [] },
      },
    });
  if (query.includes('FindIssueByRemediationLabel'))
    return response(200, { data: { issues: { nodes: [] } } });
  if (query.includes('issueLabelCreate'))
    return response(200, {
      data: {
        issueLabelCreate: {
          success: true,
          issueLabel: { id: 'label-1' },
        },
      },
    });
  if (query.includes('issueCreate'))
    return response(200, {
      data: {
        issueCreate: {
          success: true,
          issue: {
            id: 'lin-1',
            identifier: 'JOV-1',
            url: 'https://linear.app/jovie/issue/JOV-1',
          },
        },
      },
    });
  if (query.includes('commentCreate'))
    return response(500, { errors: [{ message: 'boom' }] });
  throw new Error(`unexpected ${query.slice(0, 60)}`);
}
