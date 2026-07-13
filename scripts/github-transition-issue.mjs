#!/usr/bin/env node
import { normalizeIssueNumber, transitionIssue } from './lib/tracker.mjs';

const number = normalizeIssueNumber(process.argv[2]);
const target = (process.argv[3] ?? 'in-review').trim().toLowerCase();
const comment = process.argv[4];
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
  comment,
});

if (!result.success) {
  console.error(result.error ?? 'transition failed');
  process.exit(1);
}

console.log(`#${number} -> ${target}`);
