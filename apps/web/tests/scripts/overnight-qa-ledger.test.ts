import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  appendRunEvent,
  buildDefaultRunState,
  buildRunId,
  ensureOvernightPaths,
  ensureRunDirectory,
  readIssueQueue,
  readState,
  shouldStop,
  writeIssueQueue,
  writePromptArtifact,
  writeState,
  writeSweepSummary,
} from '../../scripts/overnight-qa/ledger';
import type {
  OvernightIssue,
  OvernightPaths,
} from '../../scripts/overnight-qa/types';

function createPaths(root: string): OvernightPaths {
  return {
    controllerRoot: root,
    runsRoot: join(root, 'runs'),
    statePath: join(root, 'state.json'),
    queuePath: join(root, 'issue-queue.json'),
    stopPath: join(root, 'STOP'),
  };
}

function createIssue(): OvernightIssue {
  return {
    key: 'settings|billing|http-500',
    suiteId: 'breadth-route-qa',
    source: 'route-qa',
    surface: 'settings',
    path: '/app/settings/billing',
    summary: 'Billing settings returned HTTP 500',
    signature: 'HTTP 500',
    evidencePaths: [],
    discoveredAt: '2026-04-05T02:00:00Z',
    priority: 10,
    verificationSteps: [],
    failureContext: 'HTTP 500',
    routeFilter: '/app/settings/billing',
    testFile: null,
  };
}

describe('overnight-qa ledger', () => {
  it('builds run ids without colon separators or milliseconds', () => {
    expect(buildRunId(new Date('2026-04-04T23:10:00.000Z'))).toBe(
      '2026-04-04T23-10-00Z'
    );
  });

  it('round-trips state, queue, run artifacts, and stop signaling', async () => {
    const root = await mkdtemp(join(tmpdir(), 'overnight-qa-ledger-'));
    const paths = createPaths(root);
    await ensureOvernightPaths(paths);

    const runId = buildRunId(new Date('2026-04-05T02:00:00.000Z'));
    const runDir = await ensureRunDirectory(runId, paths);
    const state = {
      ...buildDefaultRunState(runId),
      activeRunDir: runDir,
    };
    const issue = createIssue();

    await writeState(state, paths);
    await writeIssueQueue([issue], paths);
    await writeSweepSummary(runDir, { suites: [], issues: [issue] });
    await appendRunEvent(runDir, 'queued', { issue: issue.key });
    const promptPath = await writePromptArtifact(
      runDir,
      'issue.md',
      '# Fix the issue'
    );

    expect(await readState(paths)).toEqual(state);
    expect(await readIssueQueue(paths)).toEqual([issue]);
    expect(await readFile(promptPath, 'utf8')).toBe('# Fix the issue');
    expect(await readFile(join(runDir, 'events.jsonl'), 'utf8')).toContain(
      '"eventType":"queued"'
    );

    expect(shouldStop(paths)).toBe(false);
    await writeFile(paths.stopPath, 'stop\n', 'utf8');
    expect(shouldStop(paths)).toBe(true);
  });
});
