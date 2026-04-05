import type { RiskAssessment } from './types';

const AUTO_MERGE_BLOCKERS: ReadonlyArray<{
  readonly pattern: RegExp;
  readonly reason: string;
}> = [
  {
    pattern: /^apps\/web\/app\/api\/stripe\//,
    reason: 'Stripe routes are blocked from unattended auto-merge.',
  },
  {
    pattern: /^apps\/web\/app\/api\/billing\//,
    reason: 'Billing routes are blocked from unattended auto-merge.',
  },
  {
    pattern:
      /^apps\/web\/app\/((?:\(onboarding\)|onboarding)\/|api\/onboarding\/|claim\/|.*\/\[username\]\/claim\/)/,
    reason:
      'Onboarding and profile ownership flows require human review before merge.',
  },
  {
    pattern:
      /^apps\/web\/app\/(app\/\(shell\)\/admin\/outreach\/|api\/admin\/outreach\/|api\/admin\/leads\/|api\/admin\/campaigns\/)/,
    reason: 'Growth and outreach pipeline changes require human review.',
  },
  {
    pattern:
      /^apps\/web\/(app\/api\/clerk\/|app\/api\/dev\/sync-clerk\/|lib\/auth\/|proxy\.ts$)/,
    reason: 'Auth and proxy-state adjacent changes require human review.',
  },
];

const MANUAL_REVIEW_GUARDRAILS: ReadonlyArray<{
  readonly pattern: RegExp;
  readonly reason: string;
}> = [
  {
    pattern: /^apps\/web\/drizzle\/migrations\//,
    reason:
      'Migration changes are append-only and should not auto-land overnight.',
  },
  {
    pattern: /(^|\/)middleware\.ts$/,
    reason: 'middleware.ts changes require manual review.',
  },
  {
    pattern: /(^|\/)proxy\.ts$/,
    reason: 'Proxy changes require manual review.',
  },
];

const TESTING_LABEL_PATTERNS: readonly RegExp[] = [
  /^apps\/web\/app\/api\/(stripe|billing|clerk|deploy|webhooks)\//,
  /^apps\/web\/app\/api\/(onboarding|account|notifications|dev\/test-auth)\//,
  /^apps\/web\/app\/((?:\(onboarding\)|billing|onboarding)\/)/,
  /^apps\/web\/(lib\/auth\/|lib\/entitlements\/|proxy\.ts$)/,
  /^apps\/web\/.*(config|env|vercel|drizzle|migration)/,
];

function unique(values: readonly string[]) {
  return [...new Set(values)];
}

export function assessRisk(params: {
  readonly changedFiles: readonly string[];
  readonly totalDiffLines: number;
}): RiskAssessment {
  const changedFiles = unique(
    params.changedFiles
      .map(file => file.trim())
      .filter(Boolean)
      .filter(file => !file.startsWith('.context/'))
  ).sort();
  const reasons: string[] = [];
  const labels = new Set<string>();

  let blocked = false;
  let requiresHuman = false;

  for (const filePath of changedFiles) {
    for (const guardrail of AUTO_MERGE_BLOCKERS) {
      if (guardrail.pattern.test(filePath)) {
        blocked = true;
        requiresHuman = true;
        reasons.push(`${filePath}: ${guardrail.reason}`);
      }
    }

    for (const guardrail of MANUAL_REVIEW_GUARDRAILS) {
      if (guardrail.pattern.test(filePath)) {
        blocked = true;
        requiresHuman = true;
        reasons.push(`${filePath}: ${guardrail.reason}`);
      }
    }

    if (TESTING_LABEL_PATTERNS.some(pattern => pattern.test(filePath))) {
      labels.add('testing');
    }
  }

  if (changedFiles.length > 10) {
    blocked = true;
    requiresHuman = true;
    reasons.push(
      `Diff touches ${changedFiles.length} files, exceeding the 10-file PR limit.`
    );
  }

  if (params.totalDiffLines > 400) {
    blocked = true;
    requiresHuman = true;
    reasons.push(
      `Diff is ${params.totalDiffLines} lines, exceeding the 400-line PR limit.`
    );
  }

  if (requiresHuman) {
    labels.add('needs-human');
  }

  const autoMergeEligible = !blocked && !requiresHuman;
  if (autoMergeEligible) {
    labels.add('automerge');
  }

  return {
    blocked,
    requiresHuman,
    autoMergeEligible,
    needsTesting: labels.has('testing'),
    labels: [...labels],
    reasons: unique(reasons),
    touchedPaths: changedFiles,
    totalFiles: changedFiles.length,
    totalDiffLines: params.totalDiffLines,
  };
}

export function countTotalDiffLines(numStatOutput: string) {
  return numStatOutput
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .reduce((total, line) => {
      const [added, removed] = line.split('\t', 3);
      const addCount = Number.parseInt(added ?? '0', 10);
      const removeCount = Number.parseInt(removed ?? '0', 10);
      return (
        total +
        (Number.isFinite(addCount) ? addCount : 0) +
        (Number.isFinite(removeCount) ? removeCount : 0)
      );
    }, 0);
}
