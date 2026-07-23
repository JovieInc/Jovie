#!/usr/bin/env node
import { claimIssue } from './lib/tracker.mjs';

const issueRef = process.argv[2];
const note = process.argv[3] ?? 'Loop orchestrator dispatch';
const assignee = process.env.TRACKER_ASSIGNEE;
const repo = process.env.GH_REPO ?? process.env.GITHUB_REPOSITORY;
const ownerToken = process.env.TRACKER_CLAIM_OWNER;

if (!issueRef) {
  console.error('Usage: github-claim-issue.mjs <issue-number|#N> [note]');
  process.exit(1);
}

const number = Number.parseInt(String(issueRef).replace(/^#/, ''), 10);
if (!Number.isFinite(number)) {
  console.error(`Invalid issue number: ${issueRef}`);
  process.exit(1);
}

const result = claimIssue({
  number,
  assignee,
  note,
  repo,
  ownerToken,
});

if (!result.success) {
  console.error(result.error ?? 'claim failed');
  process.exit(1);
}

console.log(`Claimed #${number}`);
