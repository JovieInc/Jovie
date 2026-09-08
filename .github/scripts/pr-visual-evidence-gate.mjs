#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * JOV-5459: Visual ENOENT is FAIL, not advisory.
 * Missing routing/manifest or a failed capture stage fails the job.
 * A `cancelled` stage is also a failure: fail-closed means only `success`
 * (or a legitimately `skipped` lane) may pass — never an interrupted stage.
 */
export function evaluateVisualEvidence({ artifactDir, stages }) {
  const failedStages = Object.entries(stages)
    .filter(([, outcome]) => outcome === 'failure' || outcome === 'cancelled')
    .map(([stage]) => stage);

  const missingEvidence = [];
  const routingPath = join(artifactDir, 'routing.json');
  const manifestPath = join(artifactDir, 'manifest.json');

  let shouldReview = false;
  if (!existsSync(routingPath)) {
    missingEvidence.push('routing.json');
  } else {
    try {
      const routing = JSON.parse(readFileSync(routingPath, 'utf8'));
      shouldReview = Boolean(routing.shouldReview);
    } catch {
      missingEvidence.push('routing.json');
    }
  }

  if (shouldReview && !existsSync(manifestPath)) {
    missingEvidence.push('manifest.json');
  }

  const ok = failedStages.length === 0 && missingEvidence.length === 0;
  let status = 'completed';
  if (!ok) status = 'unavailable';
  else if (!shouldReview) status = 'skipped';

  return {
    ok,
    status,
    advisory: false,
    stages,
    failedStages,
    missingEvidence,
    shouldReview,
  };
}

function main() {
  const artifactDir = process.env.PR_VISUAL_OUT || 'pr-visual-artifacts';
  mkdirSync(artifactDir, { recursive: true });
  const stages = {
    build: process.env.BUILD_OUTCOME || 'skipped',
    server: process.env.SERVER_OUTCOME || 'skipped',
    capture: process.env.CAPTURE_OUTCOME || 'skipped',
  };
  const result = evaluateVisualEvidence({ artifactDir, stages });
  writeFileSync(
    join(artifactDir, 'advisory-outcome.json'),
    `${JSON.stringify(
      {
        status: result.status,
        advisory: false,
        stages: result.stages,
        failedStages: result.failedStages,
        missingEvidence: result.missingEvidence,
      },
      null,
      2
    )}\n`
  );
  if (!result.ok) {
    const parts = [...result.failedStages, ...result.missingEvidence];
    console.error(
      `::error::Visual capture evidence is missing or failed at: ${parts.join(
        ', '
      )}. Visual ENOENT is FAIL, not advisory (JOV-5459).`
    );
    process.exit(1);
  }
  console.log(`Visual evidence gate passed (status: ${result.status}).`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
