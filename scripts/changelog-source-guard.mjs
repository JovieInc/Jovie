#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { evaluateCustomerNoteContract } from './lib/daily-changelog-publication.mjs';
import {
  QUOTA_DEFERRED_MARKER,
  runWithGitHubRetry,
} from './lib/github-rate-limit.mjs';

const event = process.env.GITHUB_EVENT_PATH
  ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
  : {};
const pr = event.pull_request;
if (pr) {
  if (
    !/^[a-f0-9]{40}$/.test(pr.base?.sha ?? '') ||
    !/^[a-f0-9]{40}$/.test(pr.head?.sha ?? '')
  )
    throw new Error('Missing exact PR revision evidence');
  const files = execFileSync(
    'git',
    ['diff', '--name-only', `${pr.base.sha}...${pr.head.sha}`],
    { encoding: 'utf8' }
  )
    .trim()
    .split('\n');
  // The `edited` trigger starts a fresh run for every body edit, so a first
  // attempt already holds the current body: spend no API call on it (the shared
  // GITHUB_TOKEN quota ran dry on 2026-10-11). A re-run replays the original
  // event, so it re-reads the body at the same head. An exhausted quota is
  // reported as github-quota-deferred at once (no runner held waiting for the
  // reset); Lane Fix Relay re-runs it instead of queueing repair.
  let current = { head: pr.head, body: pr.body };
  if (process.env.GITHUB_RUN_ATTEMPT !== '1') {
    const read = await runWithGitHubRetry(
      [
        'gh',
        'api',
        `repos/${process.env.GITHUB_REPOSITORY}/pulls/${pr.number}`,
      ],
      {
        attempts: 3,
        // Covers the 2s/4s transient-5xx backoff only; never a quota reset.
        maxWaitMs: 10_000,
      }
    );
    process.stderr.write(read.stderr);
    if (read.code !== 0)
      throw new Error(
        read.deferred
          ? `${QUOTA_DEFERRED_MARKER}: PR metadata read hit GitHub ${read.kind}`
          : 'PR metadata read failed'
      );
    current = JSON.parse(read.stdout);
  }
  if (current.head?.sha !== pr.head.sha)
    throw new Error('PR head advanced; validate its current source run');
  const verdict = evaluateCustomerNoteContract({
    files,
    body: current.body,
    createdAt: pr.created_at,
  });
  if (!verdict.passed)
    throw new Error(
      `Customer outcome decision missing or invalid (${verdict.reason}). See docs/CHANGELOG_PUBLICATION.md; use explicit releaseWorthy:false for internal work.`
    );
  process.stdout.write(`${JSON.stringify(verdict)}\n`);
}
