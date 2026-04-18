import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ControllerOptions,
  ManagedServer,
  OvernightPaths,
  OvernightRunState,
  SweepResult,
} from '../../scripts/overnight-qa/types';

const mocks = vi.hoisted(() => ({
  appendRunEvent: vi.fn<(...args: readonly unknown[]) => Promise<void>>(),
  writeIssueQueue: vi.fn<(...args: readonly unknown[]) => Promise<void>>(),
  writeState: vi.fn<(...args: readonly unknown[]) => Promise<void>>(),
  writeSweepSummary: vi.fn<(...args: readonly unknown[]) => Promise<void>>(),
  readIssueQueue: vi.fn(),
  shouldStop: vi.fn(),
  buildSweepManifest: vi.fn(),
  determineStopReason: vi.fn(),
  selectQueuedIssues: vi.fn(),
  runSweepSuites:
    vi.fn<(...args: readonly unknown[]) => Promise<SweepResult>>(),
  startManagedDevServer: vi.fn<() => Promise<ManagedServer>>(),
  loggerWarn: vi.fn(),
  stopServer: vi.fn<() => Promise<void>>(),
}));

vi.mock('../../scripts/overnight-qa/controller-helpers', () => ({
  buildFixBranchName: vi.fn(),
  determineStopReason: mocks.determineStopReason,
  runCodexFix: vi.fn(),
  selectQueuedIssues: mocks.selectQueuedIssues,
}));

vi.mock('../../scripts/overnight-qa/git-github', () => ({
  applyLabels: vi.fn(),
  buildPrBody: vi.fn(),
  checkoutFixBranch: vi.fn(),
  commitAll: vi.fn(),
  currentBranch: vi.fn(),
  enableAutoMerge: vi.fn(),
  ensureDraftPr: vi.fn(),
  getChangedFilesAgainstMain: vi.fn(),
  getDiffStatsAgainstMain: vi.fn(),
  prepareBaseBranch: vi.fn(),
  pushCurrentBranch: vi.fn(),
  waitForDeployVerification: vi.fn(),
  waitForPrMerge: vi.fn(),
}));

vi.mock('../../scripts/overnight-qa/ledger', () => ({
  appendRunEvent: mocks.appendRunEvent,
  readIssueQueue: mocks.readIssueQueue,
  shouldStop: mocks.shouldStop,
  writeIssueQueue: mocks.writeIssueQueue,
  writeState: mocks.writeState,
  writeSweepSummary: mocks.writeSweepSummary,
}));

vi.mock('../../scripts/overnight-qa/manifest', () => ({
  buildSweepManifest: mocks.buildSweepManifest,
}));

vi.mock('../../scripts/overnight-qa/risk', () => ({
  assessRisk: vi.fn(),
}));

vi.mock('../../scripts/overnight-qa/verify', () => ({
  buildStandardVerificationSteps: vi.fn(),
  runSweepSuites: mocks.runSweepSuites,
  runVerificationSteps: vi.fn(),
  startManagedDevServer: mocks.startManagedDevServer,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    warn: mocks.loggerWarn,
  },
}));

import { runLiveController } from '../../scripts/overnight-qa/controller-live';

const RUN_DIR = '/tmp/overnight-qa/runs/run-1';

const PATHS: OvernightPaths = {
  controllerRoot: '/tmp/overnight-qa',
  runsRoot: '/tmp/overnight-qa/runs',
  statePath: '/tmp/overnight-qa/state.json',
  queuePath: '/tmp/overnight-qa/issue-queue.json',
  stopPath: '/tmp/overnight-qa/STOP',
};

const OPTIONS: ControllerOptions = {
  dryRun: false,
  resume: false,
  statusOnly: false,
};

function createState(): OvernightRunState {
  return {
    runId: '2026-04-17T07-07-25Z',
    status: 'blocked',
    currentIssue: null,
    currentBranch: null,
    mergedFixCount: 0,
    lastPrUrl: null,
    lastDeploySha: null,
    stopReason: 'stale blocked reason',
    activeRunDir: RUN_DIR,
    queuedIssueKeys: [],
    issueHistory: {},
    consecutiveCiFailures: 0,
    consecutiveUnfixableIssues: 0,
  };
}

describe('overnight-qa controller live error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.appendRunEvent.mockResolvedValue(undefined);
    mocks.writeIssueQueue.mockResolvedValue(undefined);
    mocks.writeState.mockResolvedValue(undefined);
    mocks.writeSweepSummary.mockResolvedValue(undefined);
    mocks.readIssueQueue.mockResolvedValue([]);
    mocks.shouldStop.mockReturnValue(false);
    mocks.buildSweepManifest.mockReturnValue([]);
    mocks.determineStopReason.mockReturnValue(null);
    mocks.selectQueuedIssues.mockReturnValue([]);
    mocks.stopServer.mockResolvedValue(undefined);
    mocks.startManagedDevServer.mockResolvedValue({
      baseUrl: 'http://127.0.0.1:3000',
      port: 3000,
      stdoutPath: '/tmp/overnight-qa/stdout.log',
      stderrPath: '/tmp/overnight-qa/stderr.log',
      stop: mocks.stopServer,
    });
    mocks.runSweepSuites.mockRejectedValue(new Error('fresh crash reason'));
  });

  it('persists the new crash reason instead of a stale blocked stopReason', async () => {
    const state = createState();

    await expect(
      runLiveController({
        options: OPTIONS,
        paths: PATHS,
        runDir: RUN_DIR,
        state,
      })
    ).rejects.toThrow('fresh crash reason');

    expect(mocks.writeState).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'blocked',
        stopReason: 'fresh crash reason',
      }),
      PATHS
    );
    expect(mocks.appendRunEvent).toHaveBeenNthCalledWith(
      2,
      RUN_DIR,
      'controller-error',
      {
        stopReason: 'fresh crash reason',
      }
    );
    expect(mocks.stopServer).toHaveBeenCalledTimes(1);
  });

  it('logs persistence failures without masking the original controller crash', async () => {
    const state = createState();
    mocks.writeState.mockRejectedValueOnce(new Error('state write failed'));

    await expect(
      runLiveController({
        options: OPTIONS,
        paths: PATHS,
        runDir: RUN_DIR,
        state,
      })
    ).rejects.toThrow('fresh crash reason');

    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      'Persistence failed while handling controller error',
      expect.objectContaining({
        error: expect.any(Error),
        runDir: RUN_DIR,
        runId: state.runId,
      }),
      'overnight-qa-controller'
    );
    expect(mocks.appendRunEvent).toHaveBeenCalledTimes(1);
    expect(mocks.stopServer).toHaveBeenCalledTimes(1);
  });
});
