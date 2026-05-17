#!/usr/bin/env tsx
/**
 * CI Failure Monitor — Hermes-Air
 *
 * Watches recent failed workflow runs on main. Classifies against
 * `known-flakes.json` for known flaky patterns; files Linear issues for
 * recurring unknowns.
 *
 * Deterministic-first: only escalates to LLM when no signature matches.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { logJobEvent, withJobLogging } from '../lib/jobs-log';
import { buildFollowUpBody, fileIssue } from '../lib/linear-client';

const JOB = 'ci-failure-monitor';

const __filename = fileURLToPath(import.meta.url);
const KNOWN_FLAKES_PATH = join(dirname(__filename), 'known-flakes.json');

interface KnownFlake {
  readonly id: string;
  readonly workflow: string;
  readonly pattern: string;
  readonly note: string;
}

interface WorkflowRun {
  readonly databaseId: number;
  readonly displayTitle: string;
  readonly url: string;
  readonly workflowName: string;
  readonly conclusion: string;
  readonly headBranch: string;
  readonly createdAt: string;
}

function loadKnownFlakes(): ReadonlyArray<KnownFlake> {
  if (!existsSync(KNOWN_FLAKES_PATH)) return [];
  try {
    const parsed = JSON.parse(readFileSync(KNOWN_FLAKES_PATH, 'utf8')) as {
      readonly flakes: ReadonlyArray<KnownFlake>;
    };
    return parsed.flakes;
  } catch {
    return [];
  }
}

function listRecentFailures(): ReadonlyArray<WorkflowRun> {
  const json = execFileSync(
    'gh',
    [
      'run',
      'list',
      '--limit',
      '30',
      '--branch',
      'main',
      '--status',
      'failure',
      '--json',
      'databaseId,displayTitle,url,workflowName,conclusion,headBranch,createdAt',
    ],
    { encoding: 'utf8', timeout: 30_000 }
  );
  return JSON.parse(json) as ReadonlyArray<WorkflowRun>;
}

function logsForRun(runId: number): string {
  try {
    return execFileSync('gh', ['run', 'view', String(runId), '--log-failed'], {
      encoding: 'utf8',
      timeout: 60_000,
      maxBuffer: 5 * 1024 * 1024,
    });
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

function classifyAgainstKnown(
  log: string,
  flakes: ReadonlyArray<KnownFlake>
): KnownFlake | null {
  for (const flake of flakes) {
    try {
      if (new RegExp(flake.pattern, 'i').test(log)) return flake;
    } catch {
      // bad regex in known-flakes.json — skip
    }
  }
  return null;
}

async function processFailure(
  run: WorkflowRun,
  flakes: ReadonlyArray<KnownFlake>
): Promise<void> {
  const log = logsForRun(run.databaseId);
  const known = classifyAgainstKnown(log, flakes);

  if (known) {
    logJobEvent({
      job: JOB,
      event: 'known_flake',
      runId: run.databaseId,
      flakeId: known.id,
    });
    return;
  }

  // Unknown failure — file Linear issue.
  const filed = await fileIssue({
    title: `CI failure: ${run.workflowName} on main (run ${run.databaseId})`,
    description: buildFollowUpBody({
      source: `ci-failure-monitor`,
      sourceUrl: run.url,
      followUp: `Workflow "${run.workflowName}" failed on main at ${run.createdAt}. Title: ${run.displayTitle}. Investigate root cause; if it's a known flake, add a signature to scripts/hermes/jobs/known-flakes.json so future runs auto-classify.`,
      whyItMatters:
        'Unclassified CI failures on main block deploys and erode trust in the merge gate.',
      classification: 'Required',
      acceptanceCriteria:
        'Either a fix is merged OR a new signature is added to known-flakes.json with a documented reason.',
    }),
    source: `ci-failure-monitor:${run.databaseId}`,
  });

  logJobEvent({
    job: JOB,
    event: filed.success ? 'issue_filed' : 'file_failed',
    runId: run.databaseId,
    identifier: filed.identifier,
    error: filed.error,
  });
}

async function main(): Promise<void> {
  await withJobLogging(JOB, async () => {
    const flakes = loadKnownFlakes();
    const failures = listRecentFailures();
    logJobEvent({
      job: JOB,
      event: 'scanned',
      failureCount: failures.length,
      knownFlakeCount: flakes.length,
    });
    for (const run of failures) {
      try {
        await processFailure(run, flakes);
      } catch (err) {
        logJobEvent({
          job: JOB,
          event: 'process_failed',
          runId: run.databaseId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  });
}

void main().catch(err => {
  console.error(`[${JOB}] fatal:`, err);
  process.exit(0);
});
