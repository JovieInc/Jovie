const TEST_FILE_PATTERN = /\.(test|spec)\.[cm]?[jt]sx?$/i;

const BUG_FIX_COMMIT_PATTERN = /^fix(\(|:)/i;
const BUG_FIX_BRANCH_PATTERN = /^(fix\/|.*\/fix-)/i;
const BUG_FIX_TITLE_PATTERN = /^fix(\(|:)/i;
const BUG_FIX_PR_BODY_CHECKED_PATTERN =
  /- \[[xX]\] Bug fix \(non-breaking change which fixes an issue\)/;

const BUG_TO_TEST_WAIVER_PATTERN =
  /bug-to-test:\s*(waived|n\/a|not applicable)\b/i;
const BUG_TO_TEST_SATISFIED_PATTERN =
  /bug-to-test:\s*(satisfied|pass|passed)\b/i;
const REGRESSION_TEST_REFERENCE_PATTERN =
  /Regression test:\s*[`']?[\w./-]+\.(test|spec)\./i;

export interface BugToTestInput {
  readonly changedFiles: readonly string[];
  readonly commitMessages: readonly string[];
  readonly branchName?: string;
  readonly prTitle?: string;
  readonly prBody?: string;
}

export interface BugToTestEvaluation {
  readonly isBugFix: boolean;
  readonly bugFixSignals: readonly string[];
  readonly hasRegressionTestEvidence: boolean;
  readonly regressionTestSignals: readonly string[];
  readonly waived: boolean;
  readonly passed: boolean;
  readonly summary: string;
}

function isTestFile(filePath: string): boolean {
  return TEST_FILE_PATTERN.test(filePath);
}

function collectBugFixSignals(input: BugToTestInput): string[] {
  const signals: string[] = [];

  if (input.branchName && BUG_FIX_BRANCH_PATTERN.test(input.branchName)) {
    signals.push(`branch "${input.branchName}"`);
  }

  if (input.prTitle && BUG_FIX_TITLE_PATTERN.test(input.prTitle.trim())) {
    signals.push(`PR title "${input.prTitle.trim()}"`);
  }

  for (const message of input.commitMessages) {
    const subject = message.split('\n')[0]?.trim() ?? '';
    if (BUG_FIX_COMMIT_PATTERN.test(subject)) {
      signals.push(`commit "${subject}"`);
    }
  }

  if (input.prBody && BUG_FIX_PR_BODY_CHECKED_PATTERN.test(input.prBody)) {
    signals.push('PR template "Bug fix" checkbox');
  }

  return signals;
}

function collectRegressionTestSignals(input: BugToTestInput): string[] {
  const signals: string[] = [];

  const changedTestFiles = input.changedFiles.filter(isTestFile);
  if (changedTestFiles.length > 0) {
    signals.push(
      `changed test files: ${changedTestFiles.slice(0, 5).join(', ')}${
        changedTestFiles.length > 5 ? '…' : ''
      }`
    );
  }

  if (input.prBody) {
    if (BUG_TO_TEST_SATISFIED_PATTERN.test(input.prBody)) {
      signals.push('PR body bug-to-test: satisfied');
    }

    if (REGRESSION_TEST_REFERENCE_PATTERN.test(input.prBody)) {
      signals.push('PR body regression test reference');
    }
  }

  return signals;
}

function hasDocumentedWaiver(prBody: string | undefined): boolean {
  return Boolean(prBody && BUG_TO_TEST_WAIVER_PATTERN.test(prBody));
}

export function evaluateBugToTestRule(
  input: BugToTestInput
): BugToTestEvaluation {
  const bugFixSignals = collectBugFixSignals(input);
  const isBugFix = bugFixSignals.length > 0;

  if (!isBugFix) {
    return {
      isBugFix: false,
      bugFixSignals,
      hasRegressionTestEvidence: false,
      regressionTestSignals: [],
      waived: false,
      passed: true,
      summary: 'Not classified as a bug fix — bug-to-test rule not required.',
    };
  }

  const regressionTestSignals = collectRegressionTestSignals(input);
  const hasRegressionTestEvidence = regressionTestSignals.length > 0;
  const waived = hasDocumentedWaiver(input.prBody);

  if (hasRegressionTestEvidence) {
    return {
      isBugFix: true,
      bugFixSignals,
      hasRegressionTestEvidence: true,
      regressionTestSignals,
      waived: false,
      passed: true,
      summary: `Bug fix detected (${bugFixSignals.join(
        '; '
      )}). Regression test evidence found (${regressionTestSignals.join('; ')}).`,
    };
  }

  if (waived) {
    return {
      isBugFix: true,
      bugFixSignals,
      hasRegressionTestEvidence: false,
      regressionTestSignals,
      waived: true,
      passed: true,
      summary: `Bug fix detected (${bugFixSignals.join(
        '; '
      )}). Documented waiver found in PR body.`,
    };
  }

  return {
    isBugFix: true,
    bugFixSignals,
    hasRegressionTestEvidence: false,
    regressionTestSignals,
    waived: false,
    passed: false,
    summary: `Bug fix detected (${bugFixSignals.join(
      '; '
    )}) but no regression test evidence found. Add or update a *.test.* / *.spec.* file, or document \`bug-to-test: waived — <reason>\` in the PR body.`,
  };
}

export function buildBugToTestPrSection(
  evaluation: BugToTestEvaluation
): string {
  if (!evaluation.isBugFix) {
    return 'bug-to-test: not applicable (not a bug fix PR)';
  }

  if (evaluation.hasRegressionTestEvidence) {
    return 'bug-to-test: satisfied';
  }

  if (evaluation.waived) {
    return 'bug-to-test: waived — documented in PR template';
  }

  return 'bug-to-test: MISSING — add regression test or waiver before ship';
}
