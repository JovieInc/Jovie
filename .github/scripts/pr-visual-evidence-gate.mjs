// Fail-closed visual evidence gate (JOV-5459).
//
// Tim lock 2026-08-30: Visual ENOENT is FAIL, not advisory. When a PR routes
// UI changes into the visual capture lane, missing evidence (a failed stage,
// or a missing routing/capture manifest on disk) must fail the capture job
// with a non-zero exit, never a warning-and-continue.
//
// Skipped is still legal: a PR with no routed UI surfaces produces no
// evidence and passes. Only "we should have evidence and it does not exist"
// fails.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const ENOENT_FAIL_MESSAGE =
  'Visual ENOENT is FAIL, not advisory (JOV-5459)';

export function collectStages(env = process.env) {
  return {
    build: env.BUILD_OUTCOME || 'skipped',
    server: env.SERVER_OUTCOME || 'skipped',
    capture: env.CAPTURE_OUTCOME || 'skipped',
  };
}

/**
 * Evaluate capture evidence on disk. Returns `{ ok: false }` whenever a
 * capture stage failed or an expected evidence file is missing (ENOENT).
 */
export function evaluateVisualEvidence({ artifactDir, stages }) {
  const failedStages = Object.entries(stages)
    .filter(([, outcome]) => outcome === 'failure')
    .map(([stage]) => stage);

  const missingEvidence = [];
  let shouldReview = false;

  const routingPath = join(artifactDir, 'routing.json');
  if (!existsSync(routingPath)) {
    // No routing record at all: the lane never established whether evidence
    // was required. Fail closed instead of assuming "skipped".
    missingEvidence.push('routing.json');
  } else {
    try {
      shouldReview =
        JSON.parse(readFileSync(routingPath, 'utf8')).shouldReview === true;
    } catch {
      missingEvidence.push('routing.json');
    }
  }

  if (shouldReview && !existsSync(join(artifactDir, 'manifest.json'))) {
    missingEvidence.push('manifest.json');
  }

  const ok = failedStages.length === 0 && missingEvidence.length === 0;
  return {
    ok,
    status: ok ? (shouldReview ? 'completed' : 'skipped') : 'unavailable',
    shouldReview,
    stages,
    failedStages,
    missingEvidence,
  };
}

export function main({ env = process.env } = {}) {
  const artifactDir = env.PR_VISUAL_OUT || 'pr-visual-artifacts';
  mkdirSync(artifactDir, { recursive: true });

  const result = evaluateVisualEvidence({
    artifactDir,
    stages: collectStages(env),
  });

  writeFileSync(
    join(artifactDir, 'advisory-outcome.json'),
    JSON.stringify(
      {
        status: result.status,
        advisory: false,
        stages: result.stages,
        failedStages: result.failedStages,
        missingEvidence: result.missingEvidence,
      },
      null,
      2
    )
  );

  if (!result.ok) {
    const detail = [...result.failedStages, ...result.missingEvidence].join(
      ', '
    );
    console.error(
      `::error::Visual capture evidence is missing or failed at: ${detail}. ${ENOENT_FAIL_MESSAGE}.`
    );
    return 1;
  }
  console.log(`Visual evidence gate passed (status: ${result.status}).`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main();
}
