#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { evaluateCustomerNoteContract } from './lib/daily-changelog-publication.mjs';

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
  const verdict = evaluateCustomerNoteContract({
    files,
    body: pr.body,
    createdAt: pr.created_at,
  });
  if (!verdict.passed)
    throw new Error(
      `Customer outcome decision missing or invalid (${verdict.reason}). See docs/CHANGELOG_PUBLICATION.md; use explicit releaseWorthy:false for internal work.`
    );
  process.stdout.write(`${JSON.stringify(verdict)}\n`);
}
