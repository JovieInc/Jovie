#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  GRAPHITE_QUEUE_POLICY,
  MERGE_QUEUE_REPO_PATHS,
  validateLiveMergeQueueRuleset,
  validateMergeQueueRepoConfig,
} from './lib/merge-queue-guard.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..');

function readRepoFile(relativePath) {
  return readFileSync(resolve(REPO_ROOT, relativePath), 'utf8');
}

function loadLiveRuleset() {
  try {
    const json = execFileSync(
      'gh',
      [
        'api',
        `repos/JovieInc/Jovie/rulesets/${GRAPHITE_QUEUE_POLICY.rulesetId}`,
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          GH_FORCE_TTY: '0',
          NO_COLOR: '1',
          FORCE_COLOR: '0',
        },
      }
    );
    return JSON.parse(json);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { error: reason };
  }
}

function printPolicySummary() {
  console.log('Graphite merge-queue policy (source-of-record):');
  for (const [key, value] of Object.entries(GRAPHITE_QUEUE_POLICY)) {
    console.log(`  ${key}: ${JSON.stringify(value)}`);
  }
}

function runValidate({ checkLive = false } = {}) {
  const branchProtectionYaml = readRepoFile(
    MERGE_QUEUE_REPO_PATHS.branchProtection
  );
  const ciWorkflowYaml = readRepoFile(MERGE_QUEUE_REPO_PATHS.ciWorkflow);
  const repoValidation = validateMergeQueueRepoConfig({
    branchProtectionYaml,
    ciWorkflowYaml,
  });

  if (repoValidation.warnings.length > 0) {
    console.warn('Merge queue repo-config warnings:');
    for (const warning of repoValidation.warnings) {
      console.warn(`- ${warning}`);
    }
  }

  if (!repoValidation.ok) {
    console.error('Merge queue repo-config validation failed:');
    for (const error of repoValidation.errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `Repo config OK — required aggregates: ${repoValidation.contexts.join(', ')}`
  );

  if (!checkLive) {
    return;
  }

  const live = loadLiveRuleset();
  if (live.error) {
    console.warn(
      `Skipping live ruleset verification (gh unavailable): ${live.error}`
    );
    return;
  }

  const liveValidation = validateLiveMergeQueueRuleset(live);
  if (!liveValidation.ok) {
    console.error('Live GitHub ruleset validation failed:');
    for (const error of liveValidation.errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `Live ruleset OK — required aggregates: ${liveValidation.contexts.join(', ')}`
  );
}

async function main() {
  const command = process.argv[2];

  switch (command) {
    case 'validate':
      runValidate({ checkLive: false });
      break;
    case 'verify':
      runValidate({ checkLive: true });
      break;
    case 'policy':
      printPolicySummary();
      break;
    default:
      console.error(
        'Usage: node scripts/ci-merge-queue-check.mjs <validate|verify|policy>'
      );
      process.exitCode = 1;
  }
}

main();
