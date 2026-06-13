#!/usr/bin/env tsx

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  buildBugToTestPrSection,
  evaluateBugToTestRule,
} from '../lib/testing/bug-to-test-rule';

function readStdin(): string {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function runGit(command: string): string {
  return execSync(command, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function parseArgs(argv: string[]): {
  baseRef: string;
  prTitle?: string;
  prBody?: string;
  bodyFile?: string;
} {
  let baseRef = 'origin/main';
  let prTitle: string | undefined;
  let prBody: string | undefined;
  let bodyFile: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--base') {
      baseRef = argv[index + 1] ?? baseRef;
      index += 1;
      continue;
    }
    if (arg === '--title') {
      prTitle = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--body') {
      prBody = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--body-file') {
      bodyFile = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      console.log(`Usage: check-bug-to-test-rule.ts [options]

Options:
  --base <ref>       Diff base ref (default: origin/main)
  --title <text>     PR title override
  --body <text>      PR body override
  --body-file <path> Read PR body from file (or stdin when path is "-")
`);
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { baseRef, prTitle, prBody, bodyFile };
}

function resolvePrBody(
  prBody: string | undefined,
  bodyFile: string | undefined
): string | undefined {
  if (bodyFile) {
    if (bodyFile === '-') {
      const stdin = readStdin();
      return stdin.length > 0 ? stdin : undefined;
    }
    return readFileSync(bodyFile, 'utf8');
  }

  return prBody ?? process.env.PR_BODY;
}

function main(): void {
  const { baseRef, prTitle, prBody, bodyFile } = parseArgs(
    process.argv.slice(2)
  );

  const changedFiles = runGit(`git diff --name-only ${baseRef}...HEAD`)
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  const commitMessages = runGit(`git log ${baseRef}..HEAD --format=%s`)
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  const branchName = runGit('git branch --show-current');
  const resolvedTitle = prTitle ?? process.env.PR_TITLE;
  const resolvedBody = resolvePrBody(prBody, bodyFile);

  const evaluation = evaluateBugToTestRule({
    changedFiles,
    commitMessages,
    branchName,
    prTitle: resolvedTitle,
    prBody: resolvedBody,
  });

  console.log(buildBugToTestPrSection(evaluation));
  console.log(evaluation.summary);

  if (!evaluation.passed) {
    process.exit(1);
  }
}

main();
