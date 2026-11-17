import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CanonicalArtistSiteCertification } from '@/lib/acquisition/canonical-artist-site-certification';
import { countJourneyTests } from '../../../scripts/lib/journey-evidence-builder.mjs';

export interface M2Receipt {
  readonly steps?: readonly {
    readonly name?: string;
    readonly ok?: boolean;
    readonly detail?: string;
    readonly evidence?: readonly string[];
  }[];
}

export function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(resolve(path), 'utf8')) as T;
  } catch {
    return null;
  }
}

export function stepPassed(receipt: M2Receipt | null, name: string): boolean {
  return receipt?.steps?.some(step => step.name === name && step.ok) ?? false;
}

export function canonicalJourneyChecks(
  journeyReportPath: string | undefined,
  goldenPassed: boolean
) {
  const journeyReportRequested = journeyReportPath !== undefined;
  const journeyReport = journeyReportPath ? readJson(journeyReportPath) : null;
  // Use the existing journey verifier's strict executed-test semantics.
  // Explicitly requested evidence cannot fall back to a green aggregate.
  const specOk = (file: string) => {
    try {
      const { tests } = countJourneyTests(journeyReport, file);
      return (
        tests.total > 0 &&
        tests.passed === tests.total &&
        tests.failed === 0 &&
        tests.skipped === 0
      );
    } catch {
      return false;
    }
  };
  const billingJourneyOk = journeyReportRequested
    ? specOk('golden-path.spec.ts')
    : goldenPassed;
  const freeStateOk = journeyReportRequested
    ? specOk('claim-prebuilt.smoke.spec.ts') &&
      specOk('golden-path-home-welcome.spec.ts') &&
      specOk('golden-path.spec.ts')
    : goldenPassed;
  return { billingJourneyOk, freeStateOk };
}

/** Lineage unavailability cannot hide a failed product or invalid receipt. */
export function reportCanonicalCertificate(
  certificate: CanonicalArtistSiteCertification,
  lineageDeferralDetail: string
): number {
  console.log(certificate.statusLine);
  for (const failure of certificate.failingChecks) {
    console.error(`${failure.id}: ${failure.detail}`);
  }
  for (const failure of certificate.evidenceIntegrityFailures) {
    console.error(`evidence: ${failure}`);
  }
  const isDeferred = (check: { detail: string }) =>
    check.detail.startsWith('github-quota-deferred:');
  if (certificate.checks.some(isDeferred)) {
    console.error(
      `::warning title=github-quota-deferred::${lineageDeferralDetail}`
    );
  }
  const onlyDeferred =
    certificate.failingChecks.length > 0 &&
    certificate.failingChecks.every(isDeferred) &&
    certificate.evidenceIntegrityFailures.length === 0;
  return certificate.safeToSend || onlyDeferred ? 0 : 1;
}
