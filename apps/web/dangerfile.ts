import { danger, fail, warn } from 'danger';

// Fail if PR is too large (> 500 LOC)
const linesOfCode = danger.github.pr.additions + danger.github.pr.deletions;
if (linesOfCode > 500) {
  fail(
    `PR is too large (${linesOfCode} lines of code). Please break it down into smaller PRs.`
  );
}

const testFilePattern = /\.(test|spec)\.(t|j)sx?$/i;
const bugFixCommitPattern = /^fix(\(|:)/i;
const bugFixTitlePattern = /^fix(\(|:)/i;
const bugFixBodyPattern =
  /- \[[xX]\] Bug fix \(non-breaking change which fixes an issue\)/;
const bugToTestWaiverPattern = /bug-to-test:\s*(waived|n\/a|not applicable)\b/i;
const bugToTestSatisfiedPattern = /bug-to-test:\s*(satisfied|pass|passed)\b/i;
const regressionTestReferencePattern =
  /Regression test:\s*[`']?[\w./-]+\.(test|spec)\./i;

const changedFiles = [
  ...danger.git.created_files,
  ...danger.git.modified_files,
  ...danger.git.deleted_files,
];

const hasTestChanges = changedFiles.some(file => testFilePattern.test(file));
const commitMessages = danger.git.commits.map(commit => commit.message);

const bugFixCommitMessages = commitMessages.filter(message =>
  bugFixCommitPattern.test(message.split('\n')[0]?.trim() ?? '')
);
const isBugFixTitle = bugFixTitlePattern.test(danger.github.pr.title.trim());
const isBugFixBody = bugFixBodyPattern.test(danger.github.pr.body ?? '');
const isBugFixPr =
  bugFixCommitMessages.length > 0 || isBugFixTitle || isBugFixBody;

const hasBugToTestEvidence =
  hasTestChanges ||
  bugToTestSatisfiedPattern.test(danger.github.pr.body ?? '') ||
  regressionTestReferencePattern.test(danger.github.pr.body ?? '');
const hasBugToTestWaiver = bugToTestWaiverPattern.test(
  danger.github.pr.body ?? ''
);

if (isBugFixPr && !hasBugToTestEvidence && !hasBugToTestWaiver) {
  fail(
    'Bug-to-test rule: bug-fix PRs must add/update a regression test (*.test.* / *.spec.*) or document `bug-to-test: waived — <reason>` in the PR body.'
  );
}

// Warn if app or key component directories are touched but no tests added
const hasAppOrComponentChanges = danger.git.modified_files.some(
  file => file.includes('/app/') || file.includes('/components/')
);

if (hasAppOrComponentChanges && !hasTestChanges) {
  warn(
    'App or component files were modified but no tests were added. Consider adding tests for the changes.'
  );
}

// Warn if large files are added (disabled for now due to async complexity)
const largeFiles: string[] = [];

if (largeFiles.length > 0) {
  warn(
    `Large files detected: ${largeFiles.join(', ')}. Consider breaking them down.`
  );
}

// Check for conventional commits
const conventionalCommitRegex =
  /^(feat|fix|docs|style|refactor|perf|test|chore|ci|build|revert)(\(.+\))?: .+/;

const nonConventionalCommits = commitMessages.filter(
  msg => !conventionalCommitRegex.test(msg)
);
if (nonConventionalCommits.length > 0) {
  warn(
    'Some commits do not follow conventional commit format. Please use conventional commits.'
  );
}
