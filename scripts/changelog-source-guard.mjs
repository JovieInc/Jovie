#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
  // A failed run may be retried after the writer fixes only PR metadata.
  // Re-read the current body at the same head rather than the old event body.
  const current = JSON.parse(
    execFileSync(
      'bash',
      [
        '-c',
        'source "$1"; shift; gh_retry "$@"',
        'changelog-metadata-read',
        fileURLToPath(new URL('./lib/gh-retry.sh', import.meta.url)),
        'api',
        `repos/${process.env.GITHUB_REPOSITORY}/pulls/${pr.number}`,
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          GH_RETRY_ATTEMPTS: '3',
          GH_RETRY_BASE_DELAY: '2',
          GH_RETRY_MAX_DELAY: '4',
        },
      }
    )
  );
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
