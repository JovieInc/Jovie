import { logger } from '@/lib/utils/logger';
import {
  buildFixBranchName,
  determineStopReason,
  runCodexFix,
  selectQueuedIssues,
} from './controller-helpers';
import {
  applyLabels,
  buildPrBody,
  checkoutFixBranch,
  commitAll,
  currentBranch,
  enableAutoMerge,
  ensureDraftPr,
  getChangedFilesAgainstMain,
  getDiffStatsAgainstMain,
  prepareBaseBranch,
  pushCurrentBranch,
  waitForDeployVerification,
  waitForPrMerge,
} from './git-github';
import {
  appendRunEvent,
  readIssueQueue,
  shouldStop,
  writeIssueQueue,
  writeState,
  writeSweepSummary,
} from './ledger';
import { buildSweepManifest } from './manifest';
import { assessRisk } from './risk';
import type {
  ControllerOptions,
  OvernightPaths,
  OvernightRunState,
  SweepResult,
} from './types';
import {
  buildStandardVerificationSteps,
  runSweepSuites,
  runVerificationSteps,
  startManagedDevServer,
} from './verify';

function describeControllerError(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return 'Overnight QA controller failed.';
}

export async function runLiveController(params: {
  readonly options: ControllerOptions;
  readonly paths: OvernightPaths;
  readonly runDir: string;
  readonly state: OvernightRunState;
}) {
  const { options, paths, runDir } = params;
  let state = params.state;
  const server = await startManagedDevServer(runDir);

  try {
    await appendRunEvent(runDir, 'server-ready', {
      baseUrl: server.baseUrl,
      port: server.port,
    });

    const queue =
      options.resume && state.queuedIssueKeys.length > 0
        ? selectQueuedIssues(await readIssueQueue(paths), state)
        : [];

    let sweepResult: SweepResult | null = null;
    let issueQueue = queue;
    if (queue.length === 0) {
      sweepResult = await runSweepSuites(
        buildSweepManifest(server.baseUrl),
        runDir
      );
      issueQueue = sweepResult.issues;
    }

    if (sweepResult) {
      await writeSweepSummary(runDir, sweepResult);
      await writeIssueQueue(issueQueue, paths);
      await appendRunEvent(runDir, 'sweep-finished', {
        suites: sweepResult.suites.map(suite => ({
          id: suite.id,
          status: suite.status,
          issuesFound: suite.issuesFound,
        })),
        issuesFound: issueQueue.length,
      });
    }

    state = {
      ...state,
      status: 'running',
      queuedIssueKeys: issueQueue.map(issue => issue.key),
    };
    await writeState(state, paths);

    for (let index = 0; index < issueQueue.length; index += 1) {
      const issue = issueQueue[index];

      if (shouldStop(paths)) {
        state = {
          ...state,
          status: 'blocked',
          stopReason: 'STOP file detected.',
        };
        await writeState(state, paths);
        return;
      }

      const guardrailStopReason = determineStopReason(state);
      if (guardrailStopReason) {
        state = {
          ...state,
          status: 'blocked',
          stopReason: guardrailStopReason,
        };
        await writeState(state, paths);
        return;
      }

      const branchName =
        state.currentIssue === issue.key && state.currentBranch
          ? state.currentBranch
          : buildFixBranchName(issue, index + 1);

      if (currentBranch() !== branchName) {
        prepareBaseBranch();
        checkoutFixBranch(branchName);
      }

      state = {
        ...state,
        currentIssue: issue.key,
        currentBranch: branchName,
        issueHistory: {
          ...state.issueHistory,
          [issue.key]: {
            status: 'fixing',
            branch: branchName,
            updatedAt: new Date().toISOString(),
          },
        },
      };
      await writeState(state, paths);
      await appendRunEvent(runDir, 'issue-start', {
        issue: issue.summary,
        branchName,
      });

      const codexRun = await runCodexFix(issue, runDir);
      await appendRunEvent(runDir, 'codex-finished', {
        issue: issue.key,
        exitCode: codexRun.result.code,
        promptPath: codexRun.promptPath,
      });

      const changedFiles = getChangedFilesAgainstMain();
      if (changedFiles.length === 0) {
        state = {
          ...state,
          consecutiveUnfixableIssues: state.consecutiveUnfixableIssues + 1,
          issueHistory: {
            ...state.issueHistory,
            [issue.key]: {
              status: 'unfixable',
              branch: branchName,
              updatedAt: new Date().toISOString(),
              reason: 'Codex completed without producing a diff.',
            },
          },
        };
        await writeState(state, paths);
        continue;
      }

      const verification = runVerificationSteps(
        runDir,
        issue.key,
        buildStandardVerificationSteps(issue, changedFiles)
      );
      await verification.writes;

      if (!verification.ok) {
        state = {
          ...state,
          status: 'blocked',
          consecutiveUnfixableIssues: state.consecutiveUnfixableIssues + 1,
          stopReason: `Verification failed for ${issue.summary}.`,
          issueHistory: {
            ...state.issueHistory,
            [issue.key]: {
              status: 'unfixable',
              branch: branchName,
              updatedAt: new Date().toISOString(),
              reason: `Verification failed in ${verification.failures[0]?.step.label ?? 'unknown step'}.`,
            },
          },
        };
        await writeState(state, paths);
        return;
      }

      const diffStats = getDiffStatsAgainstMain();
      const risk = assessRisk(diffStats);
      commitAll(`fix(overnight-qa): ${issue.summary}`);
      pushCurrentBranch();

      const pr = ensureDraftPr({
        title: `fix(overnight-qa): ${issue.summary}`,
        body: buildPrBody({
          issueSummary: issue.summary,
          evidencePaths: issue.evidencePaths,
          verificationLabels: buildStandardVerificationSteps(
            issue,
            changedFiles
          ).map(step => step.label),
          riskReasons: risk.reasons,
        }),
      });
      applyLabels(pr.number, risk.labels);

      state = {
        ...state,
        lastPrUrl: pr.url,
        issueHistory: {
          ...state.issueHistory,
          [issue.key]: {
            status: risk.requiresHuman ? 'parked' : 'verified',
            branch: branchName,
            prUrl: pr.url,
            updatedAt: new Date().toISOString(),
            reason: risk.reasons[0],
          },
        },
      };
      await writeState(state, paths);

      if (risk.blocked || risk.requiresHuman || !risk.autoMergeEligible) {
        state = {
          ...state,
          status: 'blocked',
          stopReason: `Parked PR for human review: ${risk.reasons.join(' ')}`,
        };
        await writeState(state, paths);
        return;
      }

      enableAutoMerge(pr.number);
      const merge = await waitForPrMerge(pr.number);
      const deploy = await waitForDeployVerification(merge.mergeSha);

      if (deploy.status !== 'passed') {
        state = {
          ...state,
          status: 'blocked',
          currentIssue: issue.key,
          currentBranch: branchName,
          lastDeploySha: merge.mergeSha,
          consecutiveCiFailures: state.consecutiveCiFailures + 1,
          stopReason:
            deploy.status === 'timed_out'
              ? `Deploy verification timed out for ${merge.mergeSha}.`
              : `Deploy verification failed for ${merge.mergeSha}: ${deploy.failedJobs.join(', ')}`,
          issueHistory: {
            ...state.issueHistory,
            [issue.key]: {
              status: 'verified',
              branch: branchName,
              prUrl: pr.url,
              updatedAt: new Date().toISOString(),
              mergeSha: merge.mergeSha,
              reason:
                deploy.status === 'timed_out'
                  ? 'Deploy verification timed out.'
                  : deploy.failedJobs.join(', '),
            },
          },
        };
        await writeState(state, paths);
        return;
      }

      prepareBaseBranch();
      state = {
        ...state,
        mergedFixCount: state.mergedFixCount + 1,
        consecutiveCiFailures: 0,
        consecutiveUnfixableIssues: 0,
        currentIssue: null,
        currentBranch: null,
        lastDeploySha: merge.mergeSha,
        queuedIssueKeys: state.queuedIssueKeys.filter(key => key !== issue.key),
        issueHistory: {
          ...state.issueHistory,
          [issue.key]: {
            status: 'merged',
            branch: branchName,
            prUrl: pr.url,
            mergeSha: merge.mergeSha,
            updatedAt: new Date().toISOString(),
          },
        },
      };
      await writeState(state, paths);
    }

    await writeState({ ...state, status: 'complete' }, paths);
  } catch (error) {
    const stopReason = describeControllerError(error);

    try {
      await writeState(
        {
          ...state,
          status: 'blocked',
          stopReason,
        },
        paths
      );
      await appendRunEvent(runDir, 'controller-error', {
        stopReason,
      });
    } catch (persistenceError) {
      // Best-effort persistence should not mask the original controller error.
      logger.warn(
        'Persistence failed while handling controller error',
        {
          error: persistenceError,
          runId: state.runId,
          runDir,
        },
        'overnight-qa-controller'
      );
    }

    throw error;
  } finally {
    await server.stop();
  }
}
