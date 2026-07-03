#!/usr/bin/env node
/**
 * Transition a GitHub issue status via labels (or close for done).
 *
 * Usage:
 *   node scripts/github-transition-issue.mjs <issue-number> <in-progress|in-review|done> [comment]
 *
 * Mirrors scripts/linear-transition-issue.mjs.
 */

import { transitionIssue } from './lib/tracker.mjs';

const number = Number.parseInt(process.argv[2] ?? '', 10);
const statusArg = (process.argv[3] ?? '').trim().toLowerCase();
const comment = process.argv[4];

const statusMap = {
  'in-progress': 'in-progress',
  'in progress': 'in-progress',
  'in-review': 'in-review',
  'in review': 'in-review',
  done: 'done',
  closed: 'done',
};

const status = statusMap[statusArg];
if (!Number.isFinite(number) || number <= 0 || !status) {
  console.error(
    'Usage: github-transition-issue.mjs <issue-number> <in-progress|in-review|done> [comment]'
  );
  process.exit(1);
}

const repo = process.env.GITHUB_REPOSITORY;
const result = transitionIssue({ number, status, repo, comment });

if (!result.success) {
  console.error(result.error ?? 'transition failed');
  process.exit(1);
}

console.log(`#${number} → ${status}`);