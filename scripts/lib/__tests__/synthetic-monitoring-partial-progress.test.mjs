import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runSyntheticMonitoringIntake } from '../../synthetic-monitoring-intake.mjs';
import { clearRemediationLabelCache } from '../linear-issue-intake.mjs';
import { withLinearRateLimitRetry } from '../linear-rate-limit-retry.mjs';

const NOW = 1_795_000_000_000;
const ISSUE = {
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
const env = {
  TEST_STATUS: 'failed',
  FAILED_TESTS: 'fixture regression test crashed',
  PREVIOUS_CONCLUSION: 'failure',
  GITHUB_RUN_ID: 'fixture-run-24796',
};
let directory;
let warnings;

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function syntheticFixture() {
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

describe('synthetic monitoring partial Linear progress', () => {
  it('retains the filed issue and an accurate unknown receipt after comment 429', async () => {
    const { counts, fetchImpl } = syntheticFixture();
    const result = await runSyntheticMonitoringIntake({ env, fetchImpl });
    expect(result).toMatchObject({
      ok: true,
      action: 'defer',
      reason: 'linear_rate_limited',
      resetAt: NOW + 3_600_000,
      completedAction: 'created',
      id: ISSUE.id,
      identifier: ISSUE.identifier,
      url: ISSUE.url,
    });
    expect(counts).toEqual({ created: 1, updated: 0, comments: 1 });
    const warning = warnings.mock.calls.flat().join('\n');
    const summary = await readFile(join(directory, 'summary.md'), 'utf8');
    for (const receipt of [warning, summary]) {
      expect(receipt).toContain(ISSUE.identifier);
      expect(receipt).toContain('created');
      expect(receipt).toContain('unknown');
      expect(receipt).not.toContain('No Linear issue was filed or resolved');
    }
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('reuses the one fingerprinted issue when replayed after the published cooldown', async () => {
    const { counts, fetchImpl } = syntheticFixture();
    expect(
      await runSyntheticMonitoringIntake({ env, fetchImpl })
    ).toMatchObject({
      action: 'defer',
      id: ISSUE.id,
    });
    vi.setSystemTime(NOW + 3_600_001);
    expect(
      await runSyntheticMonitoringIntake({ env, fetchImpl })
    ).toMatchObject({
      ok: true,
      action: 'updated',
      id: ISSUE.id,
    });
    expect(counts).toEqual({ created: 1, updated: 1, comments: 2 });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('retains known issue identity when a later retry rate-limits before metadata', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        reason: 'linear_rate_limited',
        resetAt: NOW + 1_000,
        issue: { ...ISSUE, action: 'created' },
      })
      .mockResolvedValueOnce({
        ok: false,
        reason: 'linear_rate_limited',
        resetAt: NOW + 3_600_000,
      });
    const sleep = vi.fn(async () => {});
    const result = await withLinearRateLimitRetry(run, {
      sleep,
      now: () => NOW,
    });
    expect(run).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledExactlyOnceWith(1_000);
    expect(result).toMatchObject({
      ok: true,
      action: 'defer',
      reason: 'linear_rate_limited',
      resetAt: NOW + 3_600_000,
      completedAction: 'created',
      id: ISSUE.id,
      identifier: ISSUE.identifier,
      url: ISSUE.url,
    });
    expect(warnings.mock.calls.flat().join('\n')).toContain(ISSUE.identifier);
  });
});
