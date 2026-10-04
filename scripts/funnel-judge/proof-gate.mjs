// Deterministic proof gate for the funnel judge (JOV-7750). Persona judges
// score how a step feels; this gate fails any judged step that renders a
// claim without admissible evidence (computed, dogfood or pilot), and any
// judged paywall step that shows no outcome proof at all. It reads the
// report that apps/web/data/product-truth/golden-path-claims.test.ts keeps
// in sync with the rendered copy.

import { readFileSync } from 'node:fs';

export const PROOF_REPORT_PATH =
  'apps/web/data/product-truth/golden-path-proof.gen.json';

/** Dogfood receipts expire after this many days (dogfood.ts TTL). */
export const PROOF_REPORT_MAX_AGE_DAYS = 30;

export function readProofReport(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * @param {any} report golden-path-proof.gen.json contents
 * @param {{ judgedStepIds: string[], now?: Date }} options
 * @returns {{ pass: boolean, failures: string[], requests: any[] }}
 */
export function evaluateProofGate(report, { judgedStepIds, now = new Date() }) {
  const failures = [];
  if (report?.schema !== 'jovie.golden-path-proof/v1') {
    return {
      pass: false,
      failures: ['proof report missing or unreadable'],
      requests: [],
    };
  }
  const judged = new Set(judgedStepIds);
  const isJudged = step =>
    (report.funnelStepIds[step] ?? []).some(id => judged.has(id));

  const ageDays = (now.getTime() - Date.parse(report.asOf)) / 86_400_000;
  if (!(ageDays <= PROOF_REPORT_MAX_AGE_DAYS)) {
    failures.push(
      `proof report is ${Math.floor(ageDays)} days old: run pnpm proof:dogfood and refresh the golden-path report`
    );
  }

  const blocking = report.claims.filter(
    claim => claim.status !== 'admissible' && isJudged(claim.step)
  );
  for (const claim of blocking) {
    failures.push(
      `${claim.step} renders "${claim.copy}" with ${claim.status}: ${claim.detail}`
    );
  }
  const proofless = report.prooflessPaywallSteps.filter(isJudged);
  for (const step of proofless) {
    failures.push(
      `${step} asks for $199 with no admissible outcome proof (computed, dogfood or pilot)`
    );
  }
  const blockingIds = new Set([
    ...blocking.map(claim => `golden-path.${claim.id}`),
    ...proofless.map(step => `golden-path.${step}.paid-outcome`),
  ]);
  return {
    pass: failures.length === 0,
    failures,
    requests: report.proofRequests.filter(request =>
      blockingIds.has(request.claimId)
    ),
  };
}
