#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import {
  buildFixBranchName,
  determineStopReason,
  runCodexFix,
  selectQueuedIssues,
} from './overnight-qa/controller-helpers';
import { runLiveController } from './overnight-qa/controller-live';
import { assertPreflightClean, branchSlug } from './overnight-qa/git-github';
import {
  appendRunEvent,
  buildDefaultRunState,
  buildRunId,
  ensureOvernightPaths,
  ensureRunDirectory,
  getOvernightPaths,
  readState,
  writeIssueQueue,
  writeState,
} from './overnight-qa/ledger';
import {
  buildSurfaceInventory,
  buildSweepManifest,
} from './overnight-qa/manifest';
import type {
  ControllerOptions,
  OvernightRunState,
  OvernightSuiteDefinition,
} from './overnight-qa/types';

function parseArgs(argv: readonly string[]): ControllerOptions {
  return {
    dryRun: argv.includes('--dry-run'),
    resume: argv.includes('--resume'),
    statusOnly: argv.includes('--status'),
  };
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

  const runId =
    options.resume && existingState ? existingState.runId : buildRunId();
  const runDir =
    options.resume && existingState?.activeRunDir
      ? existingState.activeRunDir
      : await ensureRunDirectory(runId, paths);
  const state =
    options.resume && existingState
      ? existingState
      : {
          ...buildDefaultRunState(runId),
          activeRunDir: runDir,
        };

  if (!options.resume && !options.dryRun) {
    assertPreflightClean();
  }

  await writeState(state, paths);

  if (options.dryRun) {
    const previewBaseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:3100';
    const suites = buildSweepManifest(previewBaseUrl);
    await writeIssueQueue([], paths);
    await handleDryRun(runDir, state, suites);
    return;
  }

  await runLiveController({ options, paths, runDir, state });
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  void main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

export {
  buildFixBranchName,
  determineStopReason,
  runCodexFix,
  selectQueuedIssues,
};
