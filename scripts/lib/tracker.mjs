/**
 * Tracker facade — GitHub Issues first.
 *
 * Phase 1 of the Linear → GitHub Issues migration: a single place that files
 * tracker issues via the `gh` CLI so consumers stop hard-coding Linear.
 * Consumers dual-write (GitHub primary, Linear mirror) during the parallel-run
 * window and drop the mirror by setting TRACKER_GITHUB_ONLY=1.
 *
 * Deliberately create-only for now: claim/transition land with the
 * orchestrator swap (phase 2), which is their first real consumer.
 *
 * Return shape mirrors scripts/qa-swarm/linear.mjs#fileLinearIssue so
 * consumers can treat the two trackers interchangeably: never throws,
 * `{ success, identifier, url }` on success, `{ success: false, error }` on
 * failure.
 */

import { execFileSync } from 'node:child_process';

/** @param {{ title: string, labels?: readonly string[] }} input */
export function buildIssueCreateArgs({ title, labels = [] }) {
  const args = ['issue', 'create', '--title', title, '--body-file', '-'];
  for (const label of labels) {
    args.push('--label', label);
  }
  return args;
}

/** @param {string} url */
export function parseIssueNumber(url) {
  const match = /\/issues\/(\d+)\s*$/.exec(url ?? '');
  return match ? Number(match[1]) : null;
}

function defaultExec(args, input) {
  return execFileSync('gh', args, { encoding: 'utf8', input });
}

/**
 * File a GitHub issue. Never throws.
 *
 * @param {{ title: string, body: string, labels?: readonly string[] }} input
 * @param {(args: string[], input: string) => string} [exec] injectable for tests
 * @returns {{ success: boolean, number?: number | null, identifier?: string, url?: string | null, labelsDropped?: boolean, error?: string }}
 */
export function fileGithubIssue(input, exec = defaultExec) {
  const { title, body, labels = [] } = input;
  try {
    let url;
    let labelsDropped = false;
    try {
      url = exec(buildIssueCreateArgs({ title, labels }), body).trim();
    } catch (error) {
      // `gh issue create --label` fails on labels missing from the repo.
      // Losing a label is better than losing the issue — retry label-less.
      if (labels.length === 0) throw error;
      url = exec(buildIssueCreateArgs({ title, labels: [] }), body).trim();
      labelsDropped = true;
    }
    const number = parseIssueNumber(url);
    return {
      success: true,
      number,
      identifier: number ? `#${number}` : url,
      url,
      labelsDropped,
    };
  } catch (error) {
    return {
      success: false,
      url: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Mirror-to-Linear is on unless the cutover flag is set. */
export function shouldMirrorLinear(env = process.env) {
  return env.TRACKER_GITHUB_ONLY !== '1';
}
