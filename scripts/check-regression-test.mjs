#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import process from 'node:process';

const BUG_FIX_KEYWORD = /\b(fix|bug|regression|hotfix|incident)\b/i;
const TEST_FILE_PATTERN =
  /(^|\/)(__tests__\/.*|.*\.(test|spec)\.[cm]?[jt]sx?)$/i;
// Minimum meaningful explanation length, in characters, after stripping
// template boilerplate. Roughly one short sentence.
const MIN_EXCEPTION_LENGTH = 20;

function parseArgs(argv) {
  const args = {
    mode: 'warn',
    baseRef: 'origin/main',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--mode') {
      args.mode = argv[index + 1] ?? args.mode;
      index += 1;
      continue;
    }

    if (token === '--base-ref') {
      args.baseRef = argv[index + 1] ?? args.baseRef;
      index += 1;
    }
  }

  if (!['warn', 'strict'].includes(args.mode)) {
    throw new Error(`Unsupported mode "${args.mode}". Use warn or strict.`);
  }

  return args;
}

function runGit(args, options = {}) {
  try {
    return execFileSync('git', args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    }).trim();
  } catch {
    return null;
  }
}

function resolveBaseRef(baseRef) {
  const normalized = baseRef.replace(/^refs\/heads\//, '');
  const candidates = [
    baseRef,
    normalized,
    `refs/remotes/${normalized}`,
    normalized.startsWith('origin/')
      ? normalized.replace(/^origin\//, '')
      : null,
    normalized.startsWith('origin/')
      ? `refs/remotes/${normalized}`
      : `origin/${normalized}`,
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (runGit(['rev-parse', '--verify', candidate])) {
      return candidate;
    }
  }

  throw new Error(
    `Could not resolve base ref "${baseRef}". Fetch it locally or pass a valid --base-ref.`
  );
}

function readEventPayload() {
  const eventPath = process.env.GITHUB_EVENT_PATH;

  if (!eventPath || !fs.existsSync(eventPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(eventPath, 'utf8'));
  } catch {
    return null;
  }
}

function getMetadata() {
  const payload = readEventPayload();
  const pullRequest = payload?.pull_request;
  const branchName =
    process.env.GITHUB_HEAD_REF ?? runGit(['branch', '--show-current']) ?? '';

  return {
    title: process.env.PR_TITLE ?? pullRequest?.title ?? '',
    body: process.env.PR_BODY ?? pullRequest?.body ?? '',
    branchName,
  };
}

function isChecked(body, label) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`- \\[[xX]\\] ${escapedLabel}`);
  return pattern.test(body);
}

// Template placeholder instructions that should not count as a real
// explanation. Keep in sync with .github/PULL_REQUEST_TEMPLATE.md.
const TEMPLATE_EXCEPTION_BOILERPLATE = [
  'Required for bug-fix PRs that do not change any `*.test.*` or `*.spec.*` files.',
  'Required for bug-fix PRs that do not change any *.test.* or *.spec.* files.',
];

function stripHtmlComments(text) {
  // Multiline-aware: strips <!-- ... --> even when it spans lines.
  return text.replace(/<!--[\s\S]*?-->/g, '');
}

function hasRegressionException(body) {
  const decommented = stripHtmlComments(body);
  const headingMatch = decommented.match(
    /## Regression Test Exception\s+([\s\S]*?)(?:\n## |\n---|$)/i
  );

  if (!headingMatch) {
    return false;
  }

  const explanation = headingMatch[1]
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !TEMPLATE_EXCEPTION_BOILERPLATE.includes(line))
    .join(' ')
    .trim();

  return explanation.length >= MIN_EXCEPTION_LENGTH;
}

function isBugFix(metadata) {
  if (
    isChecked(
      metadata.body,
      'Bug fix (non-breaking change which fixes an issue)'
    )
  ) {
    return true;
  }

  // Keyword match on the title only. Branch names and PR bodies routinely
  // contain "fix" in non-bugfix contexts (e.g. Claude agent branches like
  // "claude/ci-fix-runner", or the unchecked "- [ ] Bug fix..." template
  // checkbox), which would otherwise produce false positives.
  return BUG_FIX_KEYWORD.test(metadata.title);
}

function getChangedFiles(baseRef) {
  const output = runGit([
    'diff',
    '--name-only',
    '--diff-filter=ACMR',
    `${baseRef}...HEAD`,
  ]);

  if (!output) {
    return [];
  }

  return output
    .split('\n')
    .map(file => file.trim())
    .filter(Boolean);
}

function hasTestFileChange(files) {
  return files.some(file => TEST_FILE_PATTERN.test(file));
}

function print(message, level = 'notice') {
  const prefix =
    level === 'error'
      ? '::error::'
      : level === 'warning'
        ? '::warning::'
        : '::notice::';

  console.log(`${prefix}${message}`);
}

function main() {
  const { mode, baseRef } = parseArgs(process.argv.slice(2));
  const resolvedBaseRef = resolveBaseRef(baseRef);
  const metadata = getMetadata();

  if (!isBugFix(metadata)) {
    print(
      `Regression-test check skipped: "${metadata.title || 'current change'}" is not classified as a bug fix.`
    );
    return;
  }

  const changedFiles = getChangedFiles(resolvedBaseRef);

  if (hasTestFileChange(changedFiles)) {
    print(
      'Regression-test policy satisfied: bug-fix change includes test coverage.'
    );
    return;
  }

  if (hasRegressionException(metadata.body)) {
    print(
      'Regression-test policy satisfied via documented Regression Test Exception in the PR body.'
    );
    return;
  }

  const message =
    'Bug-fix change detected without a modified *.test.*/*.spec.* file. Add a regression test or document a Regression Test Exception in the PR body.';

  if (mode === 'strict') {
    print(message, 'error');
    process.exitCode = 1;
    return;
  }

  print(message, 'warning');
}

main();
