#!/usr/bin/env node
/**
 * Claim a GitHub issue for agent work (status:in-progress + optional assignee).
 *
 * Usage:
 *   node scripts/github-claim-issue.mjs <issue-number> [comment]
 *
 * Exits 0 on success, 1 on failure. Mirrors scripts/linear-claim-issue.mjs.
 */

import { claimIssue } from './lib/tracker.mjs';

const number = Number.parseInt(process.argv[2] ?? '', 10);
const comment = process.argv[3] ?? 'Agent orchestrator dispatch';

if (!Number.isFinite(number) || number <= 0) {
  console.error('Usage: github-claim-issue.mjs <issue-number> [comment]');
  process.exit(1);
}

const assignee = process.env.GITHUB_AGENT_ASSIGNEE ?? 'jovie-bot';
const repo = process.env.GITHUB_REPOSITORY;

const result = claimIssue({
  number,
  assignee,
  repo,
  comment: `**Agent orchestrator** ${comment}`,
});

if (!result.success) {
  console.error(result.error ?? 'claim failed');
  process.exit(1);
}

console.log(`Claimed #${number}`);