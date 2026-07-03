/**
 * Tracker facade — GitHub Issues first.
 *
 * Phase 1: create-only (`fileGithubIssue`).
 * Phase 2: claim/transition/query for the GitHub-native orchestrator
 * (`.github/workflows/github-ai-orchestrator.yml`).
 *
 * Status labels (not GitHub Projects columns):
 * - `status:in-progress` — agent claimed / working
 * - `status:in-review` — PR open
 * - done = close the issue (merge closes via `Fixes #N` in PR body)
 *
 * Return shape for mutators mirrors `fileGithubIssue`: never throws,
 * `{ success, ... }` on success, `{ success: false, error }` on failure.
 */

import { execFileSync } from 'node:child_process';

export const AGENT_READY_LABEL = 'agent-ready';
export const STATUS_IN_PROGRESS = 'status:in-progress';
export const STATUS_IN_REVIEW = 'status:in-review';
export const HUMAN_REVIEW_LABEL = 'human-review-required';

const STATUS_LABELS = [STATUS_IN_PROGRESS, STATUS_IN_REVIEW];

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

function ghApiJson(args, exec = defaultExec) {
  const out = exec(['api', ...args], undefined);
  return JSON.parse(out);
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

/**
 * @param {{ number: number, assignee?: string, repo?: string, removeAgentReady?: boolean }} input
 */
export function buildClaimArgs({
  number,
  assignee,
  repo,
  removeAgentReady = true,
}) {
  const args = ['issue', 'edit', String(number)];
  if (repo) args.push('--repo', repo);
  args.push('--add-label', STATUS_IN_PROGRESS);
  if (removeAgentReady) args.push('--remove-label', AGENT_READY_LABEL);
  if (assignee) args.push('--add-assignee', assignee);
  return args;
}

/**
 * Claim a GitHub issue for agent work. Never throws.
 *
 * @param {{ number: number, assignee?: string, repo?: string, comment?: string, removeAgentReady?: boolean }} input
 * @param {(args: string[], input?: string) => string} [exec]
 */
export function claimIssue(input, exec = defaultExec) {
  const { number, assignee, repo, comment, removeAgentReady = true } = input;
  try {
    exec(buildClaimArgs({ number, assignee, repo, removeAgentReady }));
    if (comment) {
      const commentArgs = ['issue', 'comment', String(number), '--body', comment];
      if (repo) commentArgs.push('--repo', repo);
      exec(commentArgs);
    }
    return { success: true, number };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * @param {{ number: number, status: 'in-progress' | 'in-review' | 'done', repo?: string }} input
 */
export function buildTransitionArgs({ number, status, repo }) {
  if (status === 'done') {
    const args = ['issue', 'close', String(number)];
    if (repo) args.push('--repo', repo);
    for (const label of STATUS_LABELS) {
      args.push('--remove-label', label);
    }
    return args;
  }

  const args = ['issue', 'edit', String(number)];
  if (repo) args.push('--repo', repo);

  if (status === 'in-progress') {
    args.push('--add-label', STATUS_IN_PROGRESS, '--remove-label', STATUS_IN_REVIEW);
    return args;
  }

  args.push('--add-label', STATUS_IN_REVIEW, '--remove-label', STATUS_IN_PROGRESS);
  return args;
}

/**
 * Transition issue status via labels (or close for done). Never throws.
 *
 * @param {{ number: number, status: 'in-progress' | 'in-review' | 'done', repo?: string, comment?: string }} input
 * @param {(args: string[], input?: string) => string} [exec]
 */
export function transitionIssue(input, exec = defaultExec) {
  const { number, status, repo, comment } = input;
  try {
    exec(buildTransitionArgs({ number, status, repo }));
    if (comment) {
      const commentArgs = ['issue', 'comment', String(number), '--body', comment];
      if (repo) commentArgs.push('--repo', repo);
      exec(commentArgs);
    }
    return { success: true, number, status };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * @param {{ readonly labels?: ReadonlyArray<{ readonly name?: string } | string> }} issue
 */
export function labelNames(issue) {
  const labels = issue.labels ?? [];
  return labels.map(l => (typeof l === 'string' ? l : (l.name ?? '')));
}

/**
 * @param {{ title?: string, body?: string, labels?: ReadonlyArray<{ readonly name?: string } | string> }} issue
 */
export function shouldSkipGithubIssue(issue) {
  const names = labelNames(issue).map(n => n.toLowerCase());
  const text = `${issue.title ?? ''}${issue.body ?? ''}`.toLowerCase();

  if (names.includes(HUMAN_REVIEW_LABEL)) return true;
  if ((issue.body ?? '').includes('This issue requires human review')) return true;
  if (names.includes('type:epic')) return true;
  if (names.includes(STATUS_IN_PROGRESS) || names.includes(STATUS_IN_REVIEW)) {
    return true;
  }
  if (
    /lyb-|storekit|revenuecat|body_metric|candidate follow-up|jovieinc\/ci|loop [abc] —/i.test(
      text
    )
  ) {
    return true;
  }
  return false;
}

/**
 * List open GitHub issues eligible for agent dispatch (agent-ready, unclaimed).
 * Never throws — returns `{ success, issues }` or `{ success: false, error }`.
 *
 * @param {{ repo?: string, limit?: number, readyLabel?: string }} [input]
 * @param {(args: string[], input?: string) => string} [exec]
 */
export function queryTodoIssues(input = {}, exec = defaultExec) {
  const { repo, limit = 40, readyLabel = AGENT_READY_LABEL } = input;
  try {
    const args = [
      'issue',
      'list',
      '--state',
      'open',
      '--label',
      readyLabel,
      '--json',
      'number,title,body,labels,updatedAt,url',
      '--limit',
      String(limit),
    ];
    if (repo) args.push('--repo', repo);

    const raw = exec(args);
    const parsed = JSON.parse(raw);
    const issues = (Array.isArray(parsed) ? parsed : [])
      .filter(issue => !shouldSkipGithubIssue(issue))
      .sort((a, b) => {
        const aTime = Date.parse(a.updatedAt ?? '') || 0;
        const bTime = Date.parse(b.updatedAt ?? '') || 0;
        return bTime - aTime;
      });

    return { success: true, issues };
  } catch (error) {
    return {
      success: false,
      issues: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export { ghApiJson };