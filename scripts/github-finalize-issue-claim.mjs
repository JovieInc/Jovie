#!/usr/bin/env node
import { finalizeIssueClaim } from './lib/tracker.mjs';

const issueRef = process.argv[2];
const outcome = process.argv[3];
const note = process.argv[4] ?? '';
const ownerToken = process.env.TRACKER_CLAIM_OWNER;
const repo = process.env.GH_REPO ?? process.env.GITHUB_REPOSITORY;

if (!issueRef || !outcome) {
  console.error(
    'Usage: github-finalize-issue-claim.mjs <issue-number|#N> <retryable|in-review> [note]'
  );
  process.exit(1);
}

const number = Number.parseInt(String(issueRef).replace(/^#/, ''), 10);
if (!Number.isFinite(number)) {
  console.error(`Invalid issue number: ${issueRef}`);
  process.exit(1);
}

const result = finalizeIssueClaim({
  number,
  ownerToken,
  outcome,
  note,
  repo,
});

if (!result.success) {
  console.error(result.error ?? 'claim finalizer failed');
  process.exit(1);
}

console.log(
  result.changed
    ? `Finalized #${number} as ${outcome}`
    : `No claim change for #${number}: ${result.reason}`
);
