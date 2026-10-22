// Builds `jovie.journey-evidence/v1` (see promotion-journey-evidence.mjs) from
// the Playwright JSON report of the real Golden Path lane. The lane's single
// spec walks auth -> claim -> catalog -> billing -> return against real Better
// Auth and Stripe, so one executed spec backs both journeys. Evidence is built
// from what the report says ran; a missing report or spec yields zero tests,
// which the gate rejects.
import { EVIDENCE_SCHEMA } from './promotion-journey-evidence.mjs';

export const JOURNEY_SPEC = 'golden-path.spec.ts';

function* walkSpecs(suite) {
  for (const spec of suite?.specs ?? []) yield spec;
  for (const child of suite?.suites ?? []) yield* walkSpecs(child);
}

export function stripeModeFromKey(key = '') {
  if (key.startsWith('sk_test_') || key.startsWith('rk_test_')) return 'test';
  if (key.startsWith('sk_live_') || key.startsWith('rk_live_')) return 'live';
  return 'unknown';
}

/** Count tests of the journey spec from a Playwright JSON report. */
export function countJourneyTests(report, specFile = JOURNEY_SPEC) {
  const tests = { total: 0, passed: 0, failed: 0, skipped: 0 };
  const startedAt = report?.stats?.startTime ?? null;
  for (const suite of report?.suites ?? []) {
    for (const spec of walkSpecs(suite)) {
      if (!String(spec.file ?? '').endsWith(specFile)) continue;
      for (const t of spec.tests ?? []) {
        tests.total += 1;
        if (t.status === 'expected') tests.passed += 1;
        else if (t.status === 'skipped') tests.skipped += 1;
        else tests.failed += 1; // unexpected and flaky both fail the gate
      }
    }
  }
  return { tests, startedAt };
}

/**
 * @param {{report: any, candidateSha: string, runId: string, runUrl: string,
 *   stepOutcome: string, stripeMode: string, completedAt?: Date}} input
 * @returns {object[]} one evidence document per required journey
 */
export function buildJourneyEvidence({
  report,
  candidateSha,
  runId,
  runUrl,
  stepOutcome,
  stripeMode,
  completedAt = new Date(),
}) {
  const { tests, startedAt } = countJourneyTests(report);
  const conclusion =
    stepOutcome === 'success' &&
    tests.total > 0 &&
    tests.passed === tests.total &&
    tests.failed === 0 &&
    tests.skipped === 0
      ? 'success'
      : 'failure';
  const common = {
    schema: EVIDENCE_SCHEMA,
    candidateSha,
    deploymentSha: candidateSha,
    source: 'playwright-run',
    runId: String(runId),
    runUrl,
    conclusion,
    startedAt,
    completedAt: completedAt.toISOString(),
    spec: JOURNEY_SPEC,
    stepOutcome,
    tests,
    mocked: false,
    quarantinedExclusions: [],
  };
  return [
    {
      ...common,
      journey: 'auth',
      providers: [{ name: 'auth', mode: 'real' }],
    },
    {
      ...common,
      journey: 'billing',
      providers: [
        { name: 'auth', mode: 'real' },
        { name: 'stripe', mode: stripeMode },
      ],
    },
  ];
}
