#!/usr/bin/env node

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyLabels,
  assertPreflightClean,
  branchSlug,
  buildPrBody,
  checkoutFixBranch,
  commitAll,
  controllerRepoRoot,
  currentBranch,
  enableAutoMerge,
  ensureDraftPr,
  getChangedFilesAgainstMain,
  getDiffStatsAgainstMain,
  prepareBaseBranch,
  pushCurrentBranch,
  waitForDeployVerification,
  waitForPrMerge,
} from './overnight-qa/git-github';
import {
  appendRunEvent,
  buildDefaultRunState,
  buildRunId,
  ensureOvernightPaths,
  ensureRunDirectory,
  getOvernightPaths,
  readIssueQueue,
  readState,
  shouldStop,
  writeIssueQueue,
  writePromptArtifact,
  writeState,
  writeSweepSummary,
} from './overnight-qa/ledger';
import {
  buildSurfaceInventory,
  buildSweepManifest,
  MAX_CONSECUTIVE_CI_FAILURES,
  MAX_CONSECUTIVE_UNFIXABLE_ISSUES,
  MAX_OVERNIGHT_MERGED_FIXES,
} from './overnight-qa/manifest';
import { assessRisk } from './overnight-qa/risk';
import type {
  ControllerOptions,
  OvernightIssue,
  OvernightRunState,
  OvernightSuiteDefinition,
  SweepResult,
} from './overnight-qa/types';
import {
  buildStandardVerificationSteps,
  runCommand,
  runSweepSuites,
  runVerificationSteps,
  startManagedDevServer,
} from './overnight-qa/verify';

function parseArgs(argv: readonly string[]): ControllerOptions {
  return {
    dryRun: argv.includes('--dry-run'),
    resume: argv.includes('--resume'),
    statusOnly: argv.includes('--status'),
  };
}

export function buildFixBranchName(issue: OvernightIssue, index: number) {
  const suffix = branchSlug(
    `${issue.surface}-${issue.path ?? issue.suiteId}-${issue.signature}`
  ).slice(0, 28);
  return `itstimwhite/overnight-qa-${String(index).padStart(3, '0')}-${suffix}`;
}

export function selectQueuedIssues(
  queue: readonly OvernightIssue[],
  state: OvernightRunState
) {
  return queue.filter(issue => {
    const historyEntry = state.issueHistory[issue.key];
    return (
      historyEntry?.status !== 'merged' && historyEntry?.status !== 'parked'
    );
  });
}

export function determineStopReason(state: OvernightRunState) {
  if (state.mergedFixCount >= MAX_OVERNIGHT_MERGED_FIXES) {
    return `Merged fix cap of ${MAX_OVERNIGHT_MERGED_FIXES} reached.`;
  }

  if (state.consecutiveCiFailures >= MAX_CONSECUTIVE_CI_FAILURES) {
    return `Hit ${MAX_CONSECUTIVE_CI_FAILURES} consecutive CI or deploy failures.`;
  }

  if (state.consecutiveUnfixableIssues >= MAX_CONSECUTIVE_UNFIXABLE_ISSUES) {
    return `Hit ${MAX_CONSECUTIVE_UNFIXABLE_ISSUES} consecutive unfixable issues.`;
  }

  return null;
}

function printStatus(state: OvernightRunState | null) {
  if (!state) {
    console.log('No overnight QA state has been recorded yet.');
    return;
  }

  console.log(
    JSON.stringify(
      {
        runId: state.runId,
        status: state.status,
        currentIssue: state.currentIssue,
        currentBranch: state.currentBranch,
        mergedFixCount: state.mergedFixCount,
        lastPrUrl: state.lastPrUrl,
        lastDeploySha: state.lastDeploySha,
        stopReason: state.stopReason,
        queuedIssueKeys: state.queuedIssueKeys.length,
      },
      null,
      2
    )
  );
}

function buildFixPrompt(issue: OvernightIssue, runDir: string) {
  const evidence = issue.evidencePaths.map(path => `- ${path}`).join('\n');
  const verification = issue.verificationSteps
    .map(step => `- ${step.label}: \`${step.command.join(' ')}\``)
    .join('\n');

  return [
    'You are fixing one overnight QA issue in the Jovie repo.',
    '',
    `Issue key: ${issue.key}`,
    `Suite: ${issue.suiteId}`,
    `Surface: ${issue.surface}`,
    `Path: ${issue.path ?? 'n/a'}`,
    `Summary: ${issue.summary}`,
    '',
    'Constraints:',
    '- Investigate the root cause before editing.',
    '- Apply the smallest fix that resolves the issue.',
    '- Search for sibling instances of the same bug pattern and fix them only if they are the same defect.',
    '- Add a regression test when feasible.',
    '- Do not run /ship or /land-and-deploy from inside Codex.',
    '- Do not edit migration files or create middleware.ts.',
    '',
    'Evidence:',
    evidence || '- No local evidence files were recorded.',
    '',
    'Verification commands to keep green:',
    verification,
    '',
    `Run artifacts live under ${runDir}.`,
  ].join('\n');
}

function runCodexFix(issue: OvernightIssue, runDir: string) {
  const prompt = buildFixPrompt(issue, runDir);
  const promptFileName = `${issue.key.replaceAll('|', '_')}.md`;
  const controllerRoot = controllerRepoRoot();

  return writePromptArtifact(runDir, promptFileName, prompt).then(
    promptPath => {
      const result = runCommand(
        [
          'codex',
          'exec',
          `Read the issue brief at ${promptPath} and implement the fix in the current git branch.`,
          '-C',
          controllerRoot,
        ],
        { cwd: controllerRoot }
      );

      return { promptPath, result };
    }
  );
}

async function handleDryRun(
  runDir: string,
  state: OvernightRunState,
  suites: readonly OvernightSuiteDefinition[]
) {
  const preview = suites.map((suite, index) => ({
    suite: suite.id,
    label: suite.label,
    kind: suite.kind,
    command: suite.command.join(' '),
    plannedBranch: `itstimwhite/overnight-qa-${String(index + 1).padStart(
      3,
      '0'
    )}-${branchSlug(suite.id).slice(0, 28)}`,
  }));

  await appendRunEvent(runDir, 'dry-run-preview', {
    preview,
    inventory: buildSurfaceInventory(),
  });

  await writeState(
    {
      ...state,
      status: 'paused',
      stopReason: 'Dry run completed without mutating git or GitHub.',
    },
    getOvernightPaths()
  );

  console.log(
    JSON.stringify(
      {
        runId: state.runId,
        preview,
        inventory: buildSurfaceInventory(),
      },
      null,
      2
    )
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const paths = await ensureOvernightPaths();
  const existingState = await readState(paths);

  if (options.statusOnly) {
    printStatus(existingState);
    return;
  }

  if (!options.resume) {
    assertPreflightClean();
  }

  const runId =
    options.resume && existingState ? existingState.runId : buildRunId();
  const runDir =
    options.resume && existingState?.activeRunDir
      ? existingState.activeRunDir
      : await ensureRunDirectory(runId, paths);

  let state =
    options.resume && existingState
      ? existingState
      : {
          ...buildDefaultRunState(runId),
          activeRunDir: runDir,
        };

  await writeState(state, paths);

  if (options.dryRun) {
    const previewBaseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:3100';
    const suites = buildSweepManifest(previewBaseUrl);
    await writeIssueQueue([], paths);
    await handleDryRun(runDir, state, suites);
    return;
  }

  const server = await startManagedDevServer(runDir);

  try {
    await appendRunEvent(runDir, 'server-ready', {
      baseUrl: server.baseUrl,
      port: server.port,
    });

    const queue =
      options.resume && state.queuedIssueKeys.length > 0
        ? selectQueuedIssues(await readIssueQueue(paths), state)
        : (() => [])();

    let sweepResult: SweepResult | null = null;
    let issueQueue: readonly OvernightIssue[] = queue;
    if (queue.length === 0) {
      const suites = buildSweepManifest(server.baseUrl);
      sweepResult = await runSweepSuites(suites, runDir);
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
      commitAll(`fix(overnight-qa): ${branchSlug(issue.summary).slice(0, 50)}`);
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

    state = {
      ...state,
      status: 'complete',
      stopReason: null,
      currentIssue: null,
      currentBranch: null,
      queuedIssueKeys: [],
    };
    await writeState(state, paths);
  } finally {
    await server.stop();
  }
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  void main();
}
