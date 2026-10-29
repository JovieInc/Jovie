#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EX_TEMPFAIL, runWithGitHubRetry } from './lib/github-rate-limit.mjs';
import {
  changelogGroupCollisionDecision,
  frontItemChurnDecision,
  MERGE_QUEUE_POLICY,
  MERGE_QUEUE_REPO_PATHS,
  unmergeableEjectDecision,
  unmergeableReenqueueDecision,
  validateLiveMergeQueueRuleset,
  validateMergeQueueRepoConfig,
  validateNativeDrainQueueLabelIsolation,
} from './lib/merge-queue-guard.mjs';
import {
  buildChangelogCollisionInventory,
  changelogCollisionDrainDecision,
} from './lib/pre-land-changelog.mjs';
import { DEFAULT_MERGE_QUEUE_BACKEND } from './merge-queue-backend.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..');

function configuredBackend() {
  // Match the live repository variable/ruleset for bare local and CI callers.
  const backend =
    process.env.MERGE_QUEUE_BACKEND?.trim() || DEFAULT_MERGE_QUEUE_BACKEND;
  if (backend !== 'native') {
    throw new Error(`Unknown MERGE_QUEUE_BACKEND: ${backend}`);
  }
  return /** @type {'native'} */ (backend);
}

function readRepoFile(relativePath) {
  return readFileSync(resolve(REPO_ROOT, relativePath), 'utf8');
}

// The live read draws on the shared installation REST bucket every workflow
// uses. 2026-10-29 06:15 PT (run 40880300194): the bucket was empty at this
// read and the raw gh API call turned the installation 403 into a hard red (plus
// a Slack drift false alarm) while Automation Liveness deferred cleanly in
// the same window. The read now retries quota/transient failures within this
// budget and defers (exit 75, `github-quota-deferred`) when the reset lands
// past it; a real drift verdict is unchanged.
const LIVE_RULESET_MAX_WAIT_MS = 120_000;

async function loadLiveRuleset() {
  const outcome = await runWithGitHubRetry(
    [
      'gh',
      'api',
      `repos/JovieInc/Jovie/rulesets/${MERGE_QUEUE_POLICY.rulesetId}`,
    ],
    { attempts: 4, maxWaitMs: LIVE_RULESET_MAX_WAIT_MS }
  );
  if (outcome.code === 0) {
    try {
      return JSON.parse(outcome.stdout);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return { error: reason };
    }
  }
  if (outcome.deferred) {
    const reason = outcome.stderr.trim() || 'GitHub quota deferral';
    return { deferred: true, error: reason };
  }
  return { error: `${outcome.stderr}\n${outcome.stdout}`.trim() };
}

function printPolicySummary() {
  console.log(`${configuredBackend()} merge-queue policy (source-of-record):`);
  for (const [key, value] of Object.entries(MERGE_QUEUE_POLICY)) {
    console.log(`  ${key}: ${JSON.stringify(value)}`);
  }
}

async function runValidate({
  checkLive = false,
  allowUnavailableBypassActors = false,
} = {}) {
  const backend = configuredBackend();
  const branchProtectionYaml = readRepoFile(
    MERGE_QUEUE_REPO_PATHS.branchProtection
  );
  const ciWorkflowYaml = readRepoFile(MERGE_QUEUE_REPO_PATHS.ciWorkflow);
  const autoenrollExists = existsSync(
    resolve(REPO_ROOT, MERGE_QUEUE_REPO_PATHS.autoenrollWorkflow)
  );
  const drainScript = readRepoFile(MERGE_QUEUE_REPO_PATHS.drainScript);
  const repoValidation = validateMergeQueueRepoConfig({
    backend,
    branchProtectionYaml,
    ciWorkflowYaml,
  });
  const drainLabelIsolation =
    validateNativeDrainQueueLabelIsolation(drainScript);

  if (repoValidation.warnings.length > 0) {
    console.warn('Merge queue repo-config warnings:');
    for (const warning of repoValidation.warnings) {
      console.warn(`- ${warning}`);
    }
  }

  if (!repoValidation.ok || autoenrollExists || !drainLabelIsolation.ok) {
    if (!repoValidation.ok) {
      console.error('Merge queue repo-config validation failed:');
      for (const error of repoValidation.errors) {
        console.error(`- ${error}`);
      }
    }
    if (autoenrollExists) {
      console.error('Retired Auto-Enroll workflow must stay absent');
    }
    if (!drainLabelIsolation.ok) {
      console.error('Native drain label-isolation validation failed:');
      for (const error of drainLabelIsolation.errors) {
        console.error(`- ${error}`);
      }
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `Repo config OK — required aggregates: ${repoValidation.contexts.join(', ')}`
  );
  console.log('Retired Auto-Enroll workflow absent');
  console.log('Native drain OK — no legacy merge-queue label dependency');

  if (!checkLive) {
    return;
  }

  const live = await loadLiveRuleset();
  if (live.deferred) {
    console.warn(
      `Live GitHub ruleset verification deferred (${live.error}); not a verdict on ruleset parity. It re-runs at the next schedule or relevant main push.`
    );
    process.exitCode = EX_TEMPFAIL;
    return;
  }
  if (live.error) {
    console.error(`Live GitHub ruleset verification failed: ${live.error}`);
    process.exitCode = 1;
    return;
  }

  const liveValidation = validateLiveMergeQueueRuleset(live, {
    backend,
    allowUnavailableBypassActors,
  });
  if (!liveValidation.ok) {
    console.error('Live GitHub ruleset validation failed:');
    for (const error of liveValidation.errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  if (!liveValidation.bypassActorsVisible) {
    console.log(
      '::warning title=Ruleset bypass actors unverified::GitHub omitted bypass_actors for this token (needs ruleset edit access); bypass-actor parity was not checked'
    );
  }

  console.log(
    `Live ruleset OK — required aggregates: ${liveValidation.contexts.join(', ')}`
  );
}

async function main() {
  const command = process.argv[2];

  switch (command) {
    case 'validate':
      await runValidate({ checkLive: false });
      break;
    case 'verify':
      await runValidate({
        checkLive: true,
        allowUnavailableBypassActors: process.argv
          .slice(3)
          .includes('--allow-unavailable-bypass-actors'),
      });
      break;
    case 'policy':
      printPolicySummary();
      break;
    case 'max-queue-depth':
      console.log(String(MERGE_QUEUE_POLICY.maxQueueDepth));
      break;
    case 'front-churn': {
      // Read-only churn decision for the drain controller (JOV-5030). Recent
      // merge_group runs arrive via MERGE_GROUP_RUNS_JSON; any parse/argument
      // problem degrades to action 'unknown' (never 'block') so a controller
      // mutation can never fire on unproven evidence.
      const args = Object.fromEntries(
        process.argv
          .slice(3)
          .map(arg => /^--([^=]+)=(.*)$/.exec(arg))
          .filter(Boolean)
          .map(([, key, value]) => [key, value])
      );
      let mergeGroupRuns = null;
      try {
        const parsed = JSON.parse(process.env.MERGE_GROUP_RUNS_JSON ?? 'null');
        if (Array.isArray(parsed)) mergeGroupRuns = parsed;
      } catch {
        mergeGroupRuns = null;
      }
      const decision = frontItemChurnDecision({
        prNumber: Number(args.pr),
        currentBaseSha: String(args.base ?? '').toLowerCase(),
        headCommittedAt: args['head-committed-at'] ?? null,
        mergeGroupRuns,
        observedAt: new Date().toISOString(),
      });
      console.log(JSON.stringify(decision));
      break;
    }
    case 'unmergeable-eject': {
      let input = {};
      try {
        input = JSON.parse(process.env.UNMERGEABLE_EJECT_JSON ?? '{}');
      } catch {
        input = {};
      }
      console.log(JSON.stringify(unmergeableEjectDecision(input)));
      break;
    }
    case 'unmergeable-reenqueue': {
      let input = {};
      try {
        input = JSON.parse(process.env.UNMERGEABLE_REENQUEUE_JSON ?? '{}');
      } catch {
        input = {};
      }
      console.log(JSON.stringify(unmergeableReenqueueDecision(input)));
      break;
    }
    case 'changelog-collision': {
      let input = {};
      try {
        input = JSON.parse(process.env.CHANGELOG_COLLISION_JSON ?? '{}');
      } catch {
        input = {};
      }
      console.log(JSON.stringify(changelogGroupCollisionDecision(input)));
      break;
    }
    case 'changelog-inventory': {
      let input = {};
      try {
        input = JSON.parse(process.env.CHANGELOG_COLLISION_JSON ?? '{}');
      } catch {
        input = {};
      }
      console.log(JSON.stringify(buildChangelogCollisionInventory(input)));
      break;
    }
    case 'changelog-drain': {
      let input = {};
      try {
        input = JSON.parse(process.env.CHANGELOG_COLLISION_JSON ?? '{}');
      } catch {
        input = {};
      }
      console.log(JSON.stringify(changelogCollisionDrainDecision(input)));
      break;
    }
    default:
      console.error(
        'Usage: node scripts/ci-merge-queue-check.mjs <validate|verify|policy|max-queue-depth|front-churn|unmergeable-eject|unmergeable-reenqueue|changelog-collision|changelog-inventory|changelog-drain>'
      );
      process.exitCode = 1;
  }
}

main();
