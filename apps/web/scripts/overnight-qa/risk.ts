import type { RiskAssessment } from './types';

const DEEP_VERIFICATION_PATHS: ReadonlyArray<{
  readonly pattern: RegExp;
  readonly reason: string;
}> = [
  {
    pattern: /^apps\/web\/app\/api\/stripe\//,
    reason: 'Stripe routes require the automated billing verification lane.',
  },
  {
    pattern: /^apps\/web\/app\/api\/billing\//,
    reason: 'Billing routes require the automated billing verification lane.',
  },
  {
    pattern:
      /^apps\/web\/app\/((?:\(onboarding\)|onboarding)\/|api\/onboarding\/|claim\/|.*\/\[username\]\/claim\/)/,
    reason:
      'Onboarding and profile ownership flows require the automated ownership verification lane.',
  },
  {
    pattern:
      /^apps\/web\/app\/(app\/\(shell\)\/admin\/outreach\/|api\/admin\/outreach\/|api\/admin\/leads\/|api\/admin\/campaigns\/)/,
    reason:
      'Growth and outreach changes require the automated outbound-safety lane.',
  },
  {
    pattern:
      /^apps\/web\/(app\/api\/clerk\/|app\/api\/dev\/sync-clerk\/|lib\/auth\/|proxy\.ts$)/,
    reason:
      'Auth and proxy-state changes require the automated auth verification lane.',
  },
];

const TESTING_LABEL_PATTERNS: readonly RegExp[] = [
  /^apps\/web\/app\/api\/(stripe|billing|clerk|deploy|webhooks)\//,
  /^apps\/web\/app\/api\/(onboarding|account|notifications|dev\/test-auth)\//,
  /^apps\/web\/app\/((?:\(onboarding\)|billing|onboarding)\/)/,
  /^apps\/web\/(lib\/auth\/|lib\/entitlements\/|proxy\.ts$)/,
  /^apps\/web\/.*(config|env|vercel|drizzle|migration)/,
  /(^|\/)middleware\.ts$/,
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

  for (const filePath of changedFiles) {
    for (const guardrail of DEEP_VERIFICATION_PATHS) {
      if (guardrail.pattern.test(filePath)) {
        reasons.push(`${filePath}: ${guardrail.reason}`);
        labels.add('testing');
      }
    }

    if (TESTING_LABEL_PATTERNS.some(pattern => pattern.test(filePath))) {
      labels.add('testing');
    }
  }

  if (changedFiles.length > 10) {
    reasons.push(
      `Diff touches ${changedFiles.length} files; CI must verify the complete change set.`
    );
  }

  if (params.totalDiffLines > 400) {
    reasons.push(
      `Diff is ${params.totalDiffLines} lines; CI must verify the complete change set.`
    );
  }
  const blocked = false;
  const autoMergeEligible = true;
  labels.add('automerge');

  return {
    blocked,
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
