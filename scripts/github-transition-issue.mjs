#!/usr/bin/env node
import { transitionIssue } from './lib/tracker.mjs';

// Same normalization as github-claim-issue.mjs: accepts `123` or `#123`.
const number = Number.parseInt(String(process.argv[2]).replace(/^#/, ''), 10);
const target = (process.argv[3] ?? 'in-review').trim().toLowerCase();
// transitionIssue accepts `note` (not `comment`); wrong key was silently dropped (TS2353 / #14553).
const note = process.argv[4];
const repo = process.env.GITHUB_REPOSITORY;

const statusMap = {
  'in-progress': 'in-progress',
  'in progress': 'in-progress',
  'in-review': 'in-review',
  'in review': 'in-review',
  done: 'done',
  closed: 'done',
};

if (!number || !statusMap[target]) process.exit(1);

const result = transitionIssue({
  number,
  repo,
  status: statusMap[target],
  note,
});

if (!result.success) {
  console.error(result.error ?? 'transition failed');
  process.exit(1);
}

console.log(`#${number} -> ${target}`);
