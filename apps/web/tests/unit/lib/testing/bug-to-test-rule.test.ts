import { describe, expect, it } from 'vitest';
import {
  buildBugToTestPrSection,
  evaluateBugToTestRule,
} from '@/lib/testing/bug-to-test-rule';

describe('bug-to-test rule', () => {
  it('passes for non-bug-fix changes without test files', () => {
    const evaluation = evaluateBugToTestRule({
      changedFiles: ['apps/web/lib/foo.ts'],
      commitMessages: ['feat(testing): add nightly report'],
      branchName: 'tim/jov-1870-nightly-report',
      prTitle: 'feat(testing): add nightly report',
    });

    expect(evaluation.passed).toBe(true);
    expect(evaluation.isBugFix).toBe(false);
  });

  it('treats a colon-form fix subject as a bug fix', () => {
    const evaluation = evaluateBugToTestRule({
      changedFiles: ['apps/web/lib/auth/session.ts'],
      commitMessages: ['fix: clear stale session cookie'],
      prTitle: 'fix: clear stale session cookie',
    });

    expect(evaluation.isBugFix).toBe(true);
    expect(evaluation.bugFixSignals).toEqual([
      'PR title "fix: clear stale session cookie"',
      'commit "fix: clear stale session cookie"',
    ]);
  });

  it('requires regression test evidence for fix commits', () => {
    const evaluation = evaluateBugToTestRule({
      changedFiles: ['apps/web/lib/auth/session.ts'],
      commitMessages: ['fix(auth): clear stale session cookie'],
      branchName: 'tim/jov-1200-auth-session',
      prTitle: 'fix(auth): clear stale session cookie',
    });

    expect(evaluation.passed).toBe(false);
    expect(evaluation.isBugFix).toBe(true);
    expect(evaluation.summary).toContain(
      'no executable regression test evidence'
    );
  });

  it('passes bug fixes when a test file changed', () => {
    const evaluation = evaluateBugToTestRule({
      changedFiles: [
        'apps/web/lib/auth/session.ts',
        'apps/web/tests/unit/lib/auth/session.test.ts',
      ],
      commitMessages: ['fix(auth): clear stale session cookie'],
      branchName: 'fix/auth-session-cookie',
      prTitle: 'fix(auth): clear stale session cookie',
    });

    expect(evaluation.passed).toBe(true);
    expect(evaluation.hasRegressionTestEvidence).toBe(true);
    expect(buildBugToTestPrSection(evaluation)).toBe('bug-to-test: satisfied');
  });

  it.each([
    'session.test.mjs',
    'session.spec.cjs',
    'session.test.mts',
    'session.spec.cts',
    'session.test.jsx',
    'session.spec.tsx',
  ])('accepts repo-standard regression test extension %s', testFile => {
    const evaluation = evaluateBugToTestRule({
      changedFiles: [
        'apps/web/lib/auth/session.ts',
        `apps/web/tests/unit/lib/auth/${testFile}`,
      ],
      commitMessages: ['fix(auth): clear stale session cookie'],
    });

    expect(evaluation.passed).toBe(true);
    expect(evaluation.hasRegressionTestEvidence).toBe(true);
  });

  it('accepts the repository Python unittest convention', () => {
    const evaluation = evaluateBugToTestRule({
      changedFiles: [
        'scripts/lanes/lane_runner.py',
        'scripts/tests/test_lane_runner.py',
      ],
      commitMessages: ['fix(lanes): cancel stale repair'],
      prBody:
        'Regression test: `scripts/tests/test_lane_runner.py` covers merged targets',
    });

    expect(evaluation.passed).toBe(true);
    expect(evaluation.regressionTestSignals).toEqual([
      'changed test files: scripts/tests/test_lane_runner.py',
      'PR body references changed regression test: scripts/tests/test_lane_runner.py',
    ]);
  });

  it.each([
    'apps/ios/JovieTests/JovieAppIntentsTests.swift',
    'apps/ios/Packages/JovieKit/Tests/JovieKitTests/JovieKitTests.swift',
  ])('accepts the repository Swift test target convention %s', testFile => {
    const evaluation = evaluateBugToTestRule({
      changedFiles: ['apps/ios/Jovie/App/JovieApp.swift', testFile],
      commitMessages: ['fix(ios): route push notification CTA URL on tap'],
    });

    expect(evaluation.passed).toBe(true);
    expect(evaluation.regressionTestSignals).toEqual([
      `changed test files: ${testFile}`,
    ]);
  });

  it('rejects non-test lookalike extensions', () => {
    const evaluation = evaluateBugToTestRule({
      changedFiles: [
        'apps/web/lib/auth/session.ts',
        'apps/web/tests/unit/lib/auth/session.test.md',
      ],
      commitMessages: ['fix(auth): clear stale session cookie'],
    });

    expect(evaluation.passed).toBe(false);
    expect(evaluation.hasRegressionTestEvidence).toBe(false);
  });

  it('accepts only a bounded independently approved exception', () => {
    const evaluation = evaluateBugToTestRule({
      changedFiles: ['apps/web/lib/auth/session.ts'],
      commitMessages: ['fix(auth): typo in log message'],
      today: '2026-09-26',
      prAuthor: 'change-author',
      approvedBy: 'release-steward',
      prBody: `## Testing
Bug-to-test exception scope: copy-only log message
Bug-to-test exception rationale: no executable behavior changed
Bug-to-test exception approved-by: release-steward
Bug-to-test exception expires: 2026-10-31
Bug-to-test exception review-trigger: any behavior change in this path
Bug-to-test exception residual-count: 1`,
    });

    expect(evaluation.passed).toBe(true);
    expect(evaluation.waived).toBe(true);
  });

  it('rejects expired bug-to-test exceptions', () => {
    const evaluation = evaluateBugToTestRule({
      changedFiles: ['apps/web/lib/auth/session.ts'],
      commitMessages: ['fix(auth): typo in log message'],
      today: '2026-09-26',
      prAuthor: 'change-author',
      approvedBy: 'release-steward',
      prBody: `Bug-to-test exception scope: copy-only log message
Bug-to-test exception rationale: no executable behavior changed
Bug-to-test exception approved-by: release-steward
Bug-to-test exception expires: 2026-09-25
Bug-to-test exception review-trigger: any behavior change in this path
Bug-to-test exception residual-count: 1`,
    });

    expect(evaluation.passed).toBe(false);
    expect(evaluation.waived).toBe(false);
  });

  it('rejects self-attested bug-to-test exception approval', () => {
    const evaluation = evaluateBugToTestRule({
      changedFiles: ['apps/web/lib/auth/session.ts'],
      commitMessages: ['fix(auth): typo in log message'],
      today: '2026-09-26',
      prAuthor: 'change-author',
      approvedBy: 'change-author',
      prBody: `Bug-to-test exception scope: copy-only log message
Bug-to-test exception rationale: no executable behavior changed
Bug-to-test exception approved-by: change-author
Bug-to-test exception expires: 2026-10-31
Bug-to-test exception review-trigger: any behavior change in this path
Bug-to-test exception residual-count: 1`,
    });

    expect(evaluation.passed).toBe(false);
    expect(evaluation.waived).toBe(false);
  });

  it('rejects blanket bug-to-test waivers', () => {
    const evaluation = evaluateBugToTestRule({
      changedFiles: ['apps/web/lib/auth/session.ts'],
      commitMessages: ['fix(auth): typo in log message'],
      prBody: 'bug-to-test: waived — copy-only',
    });

    expect(evaluation.passed).toBe(false);
    expect(evaluation.waived).toBe(false);
  });

  it('rejects a satisfied label without executable evidence', () => {
    const evaluation = evaluateBugToTestRule({
      changedFiles: ['apps/web/lib/auth/session.ts'],
      commitMessages: ['fix(auth): clear stale session cookie'],
      prBody: 'bug-to-test: satisfied',
    });

    expect(evaluation.passed).toBe(false);
  });

  it('detects bug fixes from the PR template checkbox', () => {
    const evaluation = evaluateBugToTestRule({
      changedFiles: ['apps/web/lib/auth/session.ts'],
      commitMessages: ['chore(auth): patch session handling'],
      prBody: `- [x] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)`,
    });

    expect(evaluation.isBugFix).toBe(true);
    expect(evaluation.passed).toBe(false);
  });

  it('accepts references only when the regression test changed', () => {
    const evaluation = evaluateBugToTestRule({
      changedFiles: [
        'apps/web/lib/auth/session.ts',
        'apps/web/tests/unit/lib/auth/session.test.ts',
      ],
      commitMessages: ['fix(auth): clear stale session cookie'],
      prBody:
        'Regression test: apps/web/tests/unit/lib/auth/session.test.ts covers stale cookie cleanup',
    });

    expect(evaluation.passed).toBe(true);
    expect(evaluation.hasRegressionTestEvidence).toBe(true);
  });

  it('rejects references to unchanged test files', () => {
    const evaluation = evaluateBugToTestRule({
      changedFiles: ['apps/web/lib/auth/session.ts'],
      commitMessages: ['fix(auth): clear stale session cookie'],
      prBody:
        'Regression test: apps/web/tests/unit/lib/auth/session.test.ts covers stale cookie cleanup',
    });

    expect(evaluation.passed).toBe(false);
  });
});
