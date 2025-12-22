import { danger, fail, warn } from 'danger';

// Fail if PR is too large (> 500 LOC)
const linesOfCode = danger.github.pr.additions + danger.github.pr.deletions;
if (linesOfCode > 500) {
  fail(
    `PR is too large (${linesOfCode} lines of code). Please break it down into smaller PRs.`
  );
}

// Warn if app or key component directories are touched but no tests added
const hasAppOrComponentChanges = danger.git.modified_files.some(
  file => file.includes('/app/') || file.includes('/components/')
);
const hasTestChanges = danger.git.modified_files.some(
  file => file.includes('.spec.ts') || file.includes('.test.ts')
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
const commitMessages = danger.git.commits.map(commit => commit.message);

const nonConventionalCommits = commitMessages.filter(
  msg => !conventionalCommitRegex.test(msg)
);
if (nonConventionalCommits.length > 0) {
  warn(
    'Some commits do not follow conventional commit format. Please use conventional commits.'
  );
}
