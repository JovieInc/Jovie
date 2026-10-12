const TEST_FILE_PATTERN =
  /(?:\.(?:test|spec)\.[cm]?[jt]sx?|(?:^|\/)test_[^/]+\.py|(?:^|\/)apps\/ios\/(?:[^/]+\/)*[^/]*Tests\/(?:[^/]+\/)*[^/]+\.swift)$/i;

const BUG_FIX_COMMIT_PATTERN = /^fix[(:]/i;
const BUG_FIX_BRANCH_PATTERN = /^(fix\/|.*\/fix-)/i;
const BUG_FIX_TITLE_PATTERN = /^fix[(:]/i;
const BUG_FIX_PR_BODY_CHECKED_PATTERN =
  /- \[[xX]\] Bug fix \(non-breaking change which fixes an issue\)/;

const REGRESSION_TEST_REFERENCE_PATTERN = /Regression test:\s*[`']?([\w./-]+)/i;
const EXCEPTION_FIELD_PATTERNS = {
  scope: /Bug-to-test exception scope:\s*\S.+/i,
  rationale: /Bug-to-test exception rationale:\s*\S.+/i,
  approvedBy: /Bug-to-test exception approved-by:\s*\S.+/i,
  expires: /Bug-to-test exception expires:\s*\d{4}-\d{2}-\d{2}\b/i,
  reviewTrigger: /Bug-to-test exception review-trigger:\s*\S.+/i,
  residualCount: /Bug-to-test exception residual-count:\s*\d+\b/i,
} as const;

export interface BugToTestInput {
  readonly changedFiles: readonly string[];
  readonly commitMessages: readonly string[];
  readonly branchName?: string;
  readonly prTitle?: string;
  readonly prBody?: string;
  readonly today?: string;
  readonly prAuthor?: string;
  readonly approvedBy?: string;
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
    const reference = input.prBody.match(
      REGRESSION_TEST_REFERENCE_PATTERN
    )?.[1];
    if (
      reference &&
      isTestFile(reference) &&
      input.changedFiles.includes(reference)
    ) {
      signals.push(`PR body references changed regression test: ${reference}`);
    }
  }

  return signals;
}

function hasDocumentedWaiver(input: BugToTestInput): boolean {
  if (
    !input.prBody ||
    !Object.values(EXCEPTION_FIELD_PATTERNS).every(pattern =>
      pattern.test(input.prBody ?? '')
    )
  ) {
    return false;
  }

  const expiry = input.prBody
    .match(EXCEPTION_FIELD_PATTERNS.expires)?.[0]
    .match(/\d{4}-\d{2}-\d{2}/)?.[0];
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const documentedApprover = input.prBody
    .match(/Bug-to-test exception approved-by:\s*(\S.+)/i)?.[1]
    ?.trim();
  const normalizeIdentity = (identity: string) =>
    identity.replace(/^@/, '').trim().toLowerCase();
  if (!expiry) return false;
  const expiryDate = new Date(`${expiry}T00:00:00.000Z`);
  return (
    !Number.isNaN(expiryDate.valueOf()) &&
    expiryDate.toISOString().slice(0, 10) === expiry &&
    expiry > today &&
    Boolean(input.prAuthor && input.approvedBy && documentedApprover) &&
    normalizeIdentity(input.approvedBy ?? '') ===
      normalizeIdentity(documentedApprover ?? '') &&
    normalizeIdentity(input.approvedBy ?? '') !==
      normalizeIdentity(input.prAuthor ?? '')
  );
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
  const waived = hasDocumentedWaiver(input);

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
    )}) but no executable regression test evidence found. Add or update a *.test.*, *.spec.*, or test_*.py file. A valid exception requires bounded scope, rationale, independent approval, expiry, review trigger, and residual count.`,
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

  return 'bug-to-test: MISSING — add executable regression proof or a bounded exception before ship';
}
