#!/usr/bin/env tsx
/**
 * Golden-journey sweep CLI (JOV #11815).
 *
 * Runs AFTER `golden-journey:capture` has populated the run directory:
 *   1. Diffs each captured route against its rolling golden baseline.
 *   2. Sends flagged (or baseline-less) routes to the design-taste jury.
 *   3. Writes manifest.json + issue-filings.json into the run directory.
 *
 * Results are stored as workflow run artifacts; goldens roll forward via the
 * workflow cache. (Durable DB persistence of sweep metadata is a tracked
 * follow-up — see the PR for issue #11815.)
 *
 * Usage:
 *   pnpm --filter web golden-journey:sweep -- --run-id=<id> [--git-sha=<sha>] [--no-jury]
 */

import process from 'node:process';
import { runGoldenJourneySweep } from '@/lib/agent-os/golden-journey/sweep';

interface CliOptions {
  readonly runId: string;
  readonly gitSha: string | null;
  readonly juryDisabled: boolean;
}

function parseArgs(argv: readonly string[]): CliOptions {
  let runId = process.env.GOLDEN_JOURNEY_RUN_ID ?? '';
  let gitSha: string | null = process.env.GITHUB_SHA ?? null;
  let juryDisabled = false;

  for (const arg of argv) {
    if (arg.startsWith('--run-id=')) {
      runId = arg.slice('--run-id='.length);
    } else if (arg.startsWith('--git-sha=')) {
      gitSha = arg.slice('--git-sha='.length);
    } else if (arg === '--no-jury') {
      juryDisabled = true;
    }
  }

  if (!runId.trim()) {
    throw new Error(
      'Missing golden journey run id. Pass --run-id=<id> or GOLDEN_JOURNEY_RUN_ID.'
    );
  }

  return { runId: runId.trim(), gitSha, juryDisabled };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  const gatewayKeyPresent = Boolean(process.env.AI_GATEWAY_API_KEY?.trim());
  const juryEnabled = !options.juryDisabled && gatewayKeyPresent;
  const jurySkipReason = options.juryDisabled
    ? 'Jury disabled via --no-jury.'
    : 'AI_GATEWAY_API_KEY not configured; skipped VLM review.';

  const { manifest, manifestPath, issueFilingsPath } =
    await runGoldenJourneySweep({
      runId: options.runId,
      gitSha: options.gitSha,
      juryEnabled,
      jurySkipReason,
    });

  process.stdout.write(
    `${JSON.stringify(
      {
        manifestPath,
        issueFilingsPath,
        summary: manifest.summary,
        juryEnabled,
      },
      null,
      2
    )}\n`
  );

  if (manifest.issueFilings.length > 0) {
    // Non-zero exit signals the workflow to surface flagged regressions.
    process.exitCode = 2;
  }
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
