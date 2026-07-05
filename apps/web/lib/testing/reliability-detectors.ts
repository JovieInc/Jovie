/**
 * Reliability detector registry (JOV-1855).
 *
 * Every production bug in this loop must map to at least one durable detector:
 * cron probe, nightly E2E canary, unit regression test, PR policy, or quarantine
 * ledger entry. Child issues JOV-1870–JOV-1874 implemented the pieces; this
 * registry is the single source of truth that ties them together and is
 * validated in Structural Contract CI.
 */

export type ReliabilityDetectorKind =
  | 'cron'
  | 'e2e-canary'
  | 'pr-policy'
  | 'ledger'
  | 'report';

export interface ReliabilityDetector {
  readonly id: string;
  readonly sourceIssue: string;
  readonly symptom: string;
  readonly kind: ReliabilityDetectorKind;
  /** Repo-root-relative paths that must exist on disk. */
  readonly artifacts: readonly string[];
}

/** Playwright globs for nightly canary specs — consumed by playwright.config.nightly.ts. */
export const RELIABILITY_CANARY_E2E_GLOBS = [
  '**/canary-public-profile.spec.ts',
  '**/canary-auth-signup-onboarding.spec.ts',
] as const;

export const RELIABILITY_DETECTORS: readonly ReliabilityDetector[] = [
  {
    id: 'public-profile-canary',
    sourceIssue: 'JOV-1872',
    symptom:
      'Public profile, alerts, pay redirect, or audience-visit route regresses in production',
    kind: 'cron',
    artifacts: [
      'apps/web/lib/canaries/public-profile.ts',
      'apps/web/app/api/cron/public-profile-canary/route.ts',
      'apps/web/tests/e2e/canary-public-profile.spec.ts',
      'apps/web/lib/canaries/public-profile.test.ts',
    ],
  },
  {
    id: 'auth-signup-onboarding-canary',
    sourceIssue: 'JOV-1871',
    symptom:
      'Signup, signin, onboarding start, or anonymous chat gate regresses in production',
    kind: 'cron',
    artifacts: [
      'apps/web/lib/canaries/auth-signup-onboarding.ts',
      'apps/web/app/api/cron/auth-signup-onboarding-canary/route.ts',
      'apps/web/tests/e2e/canary-auth-signup-onboarding.spec.ts',
      'apps/web/lib/canaries/auth-signup-onboarding.test.ts',
    ],
  },
  {
    id: 'bug-to-test-rule',
    sourceIssue: 'JOV-1873',
    symptom: 'Bug fix ships without a regression test or documented waiver',
    kind: 'pr-policy',
    artifacts: [
      'apps/web/lib/testing/bug-to-test-rule.ts',
      'apps/web/scripts/check-bug-to-test-rule.ts',
      'apps/web/tests/unit/lib/testing/bug-to-test-rule.test.ts',
      'apps/web/dangerfile.ts',
      '.github/PULL_REQUEST_TEMPLATE.md',
    ],
  },
  {
    id: 'flaky-quarantine-ledger',
    sourceIssue: 'JOV-1874',
    symptom:
      'Flaky test quarantined without owner, reproduction command, or expiration',
    kind: 'ledger',
    artifacts: [
      'apps/web/lib/testing/quarantine-ledger.ts',
      'apps/web/tests/quarantine.json',
      'apps/web/scripts/check-quarantine-ledger.ts',
      'apps/web/tests/unit/lib/testing/quarantine-ledger.test.ts',
    ],
  },
  {
    id: 'nightly-testing-agent',
    sourceIssue: 'JOV-1870',
    symptom:
      'High-risk surfaces lack a daily deterministic risk report for ops',
    kind: 'report',
    artifacts: [
      'apps/web/lib/testing/nightly-agent-report.ts',
      'apps/web/scripts/nightly-test-agent.ts',
      'apps/web/tests/unit/lib/testing/nightly-agent-report.test.ts',
      '.github/workflows/nightly-testing-agent.yml',
    ],
  },
] as const;

export interface ReliabilityDetectorValidationIssue {
  readonly detectorId: string;
  readonly artifact: string;
  readonly message: string;
}

export interface ReliabilityDetectorValidationResult {
  readonly ok: boolean;
  readonly issues: readonly ReliabilityDetectorValidationIssue[];
}

export function validateReliabilityDetectorArtifacts(
  exists: (repoRootRelativePath: string) => boolean
): ReliabilityDetectorValidationResult {
  const issues: ReliabilityDetectorValidationIssue[] = [];

  for (const detector of RELIABILITY_DETECTORS) {
    for (const artifact of detector.artifacts) {
      if (!exists(artifact)) {
        issues.push({
          detectorId: detector.id,
          artifact,
          message: `Missing artifact for detector "${detector.id}"`,
        });
      }
    }
  }

  return { ok: issues.length === 0, issues };
}

function extractRootTestMatchBlock(configSource: string): string | null {
  const defineConfigIndex = configSource.indexOf('defineConfig');
  if (defineConfigIndex === -1) {
    return null;
  }

  const testMatchIndex = configSource.indexOf('testMatch:', defineConfigIndex);
  if (testMatchIndex === -1) {
    return null;
  }

  const arrayStart = configSource.indexOf('[', testMatchIndex);
  if (arrayStart === -1) {
    return null;
  }

  let depth = 0;
  for (let index = arrayStart; index < configSource.length; index += 1) {
    const char = configSource[index];
    if (char === '[') {
      depth += 1;
    } else if (char === ']') {
      depth -= 1;
      if (depth === 0) {
        return configSource.slice(arrayStart, index + 1);
      }
    }
  }

  return null;
}

export function nightlyPlaywrightConfigIncludesCanarySpecs(
  configSource: string
): boolean {
  const testMatchBlock = extractRootTestMatchBlock(configSource);
  if (!testMatchBlock) {
    return false;
  }

  const importsRegistry = configSource.includes(
    './lib/testing/reliability-detectors'
  );
  const spreadsCanaryGlobsInTestMatch = testMatchBlock.includes(
    '...RELIABILITY_CANARY_E2E_GLOBS'
  );

  if (importsRegistry && spreadsCanaryGlobsInTestMatch) {
    return true;
  }

  return RELIABILITY_CANARY_E2E_GLOBS.every(glob =>
    testMatchBlock.includes(glob)
  );
}

export function formatReliabilityDetectorReport(
  result: ReliabilityDetectorValidationResult
): string {
  if (result.ok) {
    return `Reliability detector registry OK (${RELIABILITY_DETECTORS.length} detectors, ${RELIABILITY_CANARY_E2E_GLOBS.length} nightly canary specs)`;
  }

  const lines = result.issues.map(
    issue => `- [${issue.detectorId}] ${issue.artifact}: ${issue.message}`
  );
  return ['Reliability detector registry FAILED:', ...lines].join('\n');
}
