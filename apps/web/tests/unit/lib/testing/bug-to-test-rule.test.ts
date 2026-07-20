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

  it('requires regression test evidence for fix commits', () => {
    const evaluation = evaluateBugToTestRule({
      changedFiles: ['apps/web/lib/auth/session.ts'],
      commitMessages: ['fix(auth): clear stale session cookie'],
      branchName: 'tim/jov-1200-auth-session',
      prTitle: 'fix(auth): clear stale session cookie',
    });

    expect(evaluation.passed).toBe(false);
    expect(evaluation.isBugFix).toBe(true);
    expect(evaluation.summary).toContain('no regression test evidence');
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

  it('passes bug fixes with an explicit waiver in the PR body', () => {
    const evaluation = evaluateBugToTestRule({
      changedFiles: ['apps/web/lib/auth/session.ts'],
      commitMessages: ['fix(auth): typo in log message'],
      prBody:
        '## Testing\nbug-to-test: waived — copy-only log message fix with no behavioral change',
    });

    expect(evaluation.passed).toBe(true);
    expect(evaluation.waived).toBe(true);
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

  it('accepts regression test references in the PR body', () => {
    const evaluation = evaluateBugToTestRule({
      changedFiles: ['apps/web/lib/auth/session.ts'],
      commitMessages: ['fix(auth): clear stale session cookie'],
      prBody:
        'Regression test: apps/web/tests/unit/lib/auth/session.test.ts covers stale cookie cleanup',
    });

    expect(evaluation.passed).toBe(true);
    expect(evaluation.hasRegressionTestEvidence).toBe(true);
  });
});
