/**
 * Tracker facade — GitHub Issues first.
 *
 * Phase 1 of the Linear → GitHub Issues migration: a single place that files
 * tracker issues via the `gh` CLI so consumers stop hard-coding Linear.
 * Consumers dual-write (GitHub primary, Linear mirror) during the parallel-run
 * window and drop the mirror by setting TRACKER_GITHUB_ONLY=1.
 *
 * Phase 2 adds claim/transition helpers for the GitHub-native orchestrator.
 *
 * Return shape mirrors scripts/qa-swarm/linear.mjs#fileLinearIssue so
 * consumers can treat the two trackers interchangeably: never throws,
 * `{ success, identifier, url }` on success, `{ success: false, error }` on
 * failure.
 */

import { execFileSync } from 'node:child_process';

export const STATUS_IN_PROGRESS = 'status:in-progress';
export const STATUS_IN_REVIEW = 'status:in-review';
export const AGENT_READY_LABEL = 'agent-ready';
export const CLAIM_OWNER_MARKER = 'github-ai-claim-owner';
export const CLAIM_FINALIZED_MARKER = 'github-ai-claim-finalized';

/** @type {ReadonlySet<string>} */
export const STATUS_LABELS = new Set([STATUS_IN_PROGRESS, STATUS_IN_REVIEW]);

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

function repoArgs(repo) {
  return repo ? ['--repo', repo] : [];
}

function isValidClaimOwner(ownerToken) {
  return /^[A-Za-z0-9._:/-]+$/.test(ownerToken ?? '');
}

function claimOwnerMarker(ownerToken) {
  return `<!-- ${CLAIM_OWNER_MARKER}:${ownerToken} -->`;
}

function claimFinalizedMarker(ownerToken, outcome) {
  return `<!-- ${CLAIM_FINALIZED_MARKER}:${ownerToken}:${outcome} -->`;
}

function commentAuthor(comment) {
  return comment?.user?.login ?? comment?.author?.login ?? '';
}

function flattenComments(raw) {
  const parsed = JSON.parse(raw);
  const pages = Array.isArray(parsed) ? parsed : [];
  return pages.flatMap(page => (Array.isArray(page) ? page : [page]));
}

/**
 * @param {string | number} issueNumber
 * @param {readonly string[]} removeLabels
 * @param {readonly string[]} addLabels
 * @param {(args: string[]) => string} exec
 * @param {string | undefined} repo
 */
function swapLabels(issueNumber, removeLabels, addLabels, exec, repo) {
  const args = [
    'issue',
    'edit',
    String(issueNumber),
    ...repoArgs(repo),
    ...removeLabels.flatMap(label => ['--remove-label', label]),
    ...addLabels.flatMap(label => ['--add-label', label]),
  ];
  exec(args);
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

/**
 * Claim a GitHub issue for agent work: assignee + status:in-progress label.
 * Never throws.
 *
 * @param {{ number: number, assignee?: string, note?: string, repo?: string, ownerToken?: string }} input
 * @param {(args: string[]) => string} [exec]
 */
export function claimIssue(input, exec = args => defaultExec(args)) {
  const { number, assignee, note = 'Agent dispatch', repo, ownerToken } = input;
  try {
    if (ownerToken && !isValidClaimOwner(ownerToken)) {
      throw new Error('Invalid claim owner token');
    }

    const commentArgs = [
      'issue',
      'comment',
      String(number),
      ...repoArgs(repo),
      '--body',
      `**Agent claim** ${note}${
        ownerToken ? `\n\n${claimOwnerMarker(ownerToken)}` : ''
      }`,
    ];

    // Persist the exact owner before publishing the status label. If the
    // receipt write fails, there is no unowned in-progress claim to strand.
    if (ownerToken) {
      exec(commentArgs);
    }

    const editArgs = [
      'issue',
      'edit',
      String(number),
      ...repoArgs(repo),
      ...[...STATUS_LABELS].flatMap(label => ['--remove-label', label]),
      '--add-label',
      STATUS_IN_PROGRESS,
    ];
    exec(editArgs);

    if (assignee) {
      try {
        exec([
          'issue',
          'edit',
          String(number),
          ...repoArgs(repo),
          '--add-assignee',
          assignee,
        ]);
      } catch {
        // Status label is the shared claim signal. Assignee is best-effort
        // because bot actors are not always assignable GitHub users.
      }
    }

    if (!ownerToken) {
      exec(commentArgs);
    }

    return {
      success: true,
      number,
      identifier: `#${number}`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Finalize an orchestrator-owned issue claim. The latest trusted claim receipt
 * must match ownerToken, so an old workflow run cannot release a newer run's
 * claim. Retryable finalization removes only status:in-progress and preserves
 * agent-ready. PR finalization transitions the owned claim to in-review.
 *
 * @param {{ number: number, ownerToken: string, outcome: 'retryable' | 'in-review', note?: string, repo: string, expectedActor?: string }} input
 * @param {(args: string[]) => string} [exec]
 */
export function finalizeIssueClaim(input, exec = args => defaultExec(args)) {
  const {
    number,
    ownerToken,
    outcome,
    note = '',
    repo,
    expectedActor = 'github-actions[bot]',
  } = input;

  try {
    if (!repo) throw new Error('repo is required to finalize a claim');
    if (!isValidClaimOwner(ownerToken)) {
      throw new Error('Invalid claim owner token');
    }
    if (outcome !== 'retryable' && outcome !== 'in-review') {
      throw new Error(`Invalid claim finalizer outcome: ${outcome}`);
    }

    const comments = flattenComments(
      exec([
        'api',
        '--paginate',
        '--slurp',
        `repos/${repo}/issues/${number}/comments?per_page=100`,
      ])
    ).filter(comment => commentAuthor(comment) === expectedActor);
    const latestClaim = comments
      .map(comment => String(comment?.body ?? ''))
      .filter(body => body.includes(`<!-- ${CLAIM_OWNER_MARKER}:`))
      .at(-1);

    if (!latestClaim?.includes(claimOwnerMarker(ownerToken))) {
      return {
        success: true,
        changed: false,
        number,
        outcome,
        reason: 'not-owner',
      };
    }

    const issue = JSON.parse(exec(['api', `repos/${repo}/issues/${number}`]));
    const labels = new Set(
      (issue.labels ?? []).map(label =>
        typeof label === 'string' ? label : label.name
      )
    );
    const alreadyFinalized =
      outcome === 'in-review'
        ? labels.has(STATUS_IN_REVIEW) && !labels.has(STATUS_IN_PROGRESS)
        : !labels.has(STATUS_IN_PROGRESS);
    if (alreadyFinalized) {
      return {
        success: true,
        changed: false,
        number,
        outcome,
        reason: 'already-finalized',
      };
    }

    if (!labels.has(STATUS_IN_PROGRESS)) {
      return {
        success: true,
        changed: false,
        number,
        outcome,
        reason: 'no-active-claim',
      };
    }

    const finalizedMarker = claimFinalizedMarker(ownerToken, outcome);
    const hasFinalizedReceipt = comments.some(comment =>
      String(comment?.body ?? '').includes(finalizedMarker)
    );
    if (!hasFinalizedReceipt) {
      exec([
        'issue',
        'comment',
        String(number),
        ...repoArgs(repo),
        '--body',
        `**Agent claim finalizer** ${note}\n\n${finalizedMarker}`,
      ]);
    }

    if (outcome === 'in-review') {
      swapLabels(number, [STATUS_IN_PROGRESS], [STATUS_IN_REVIEW], exec, repo);
    } else {
      swapLabels(number, [STATUS_IN_PROGRESS], [], exec, repo);
    }

    return { success: true, changed: true, number, outcome };
  } catch (error) {
    return {
      success: false,
      changed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Transition issue status via status:* labels. `done` closes the issue.
 * Never throws.
 *
 * @param {{ number: number, status: 'in-progress' | 'in-review' | 'done', note?: string, repo?: string }} input
 * @param {(args: string[]) => string} [exec]
 */
export function transitionIssue(input, exec = args => defaultExec(args)) {
  const { number, status, note, repo } = input;
  try {
    if (status === 'done') {
      exec([
        'issue',
        'close',
        String(number),
        ...repoArgs(repo),
        ...(note ? ['--comment', note] : []),
      ]);
      swapLabels(number, [...STATUS_LABELS], [], exec, repo);
      return {
        success: true,
        number,
        identifier: `#${number}`,
        status: 'done',
      };
    }

    const targetLabel =
      status === 'in-review' ? STATUS_IN_REVIEW : STATUS_IN_PROGRESS;
    swapLabels(number, [...STATUS_LABELS], [targetLabel], exec, repo);

    if (note) {
      exec([
        'issue',
        'comment',
        String(number),
        ...repoArgs(repo),
        '--body',
        note,
      ]);
    }

    return {
      success: true,
      number,
      identifier: `#${number}`,
      status,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * List open GitHub issues eligible for agent dispatch (no status labels yet).
 *
 * @param {{ repo?: string, limit?: number, readyLabel?: string }} [input]
 * @param {(args: string[]) => string} [exec]
 */
export function queryTodoIssues(input = {}, exec = args => defaultExec(args)) {
  const { repo, limit = 40, readyLabel = AGENT_READY_LABEL } = input;
  try {
    const raw = exec([
      'issue',
      'list',
      ...repoArgs(repo),
      '--state',
      'open',
      '--label',
      readyLabel,
      '--limit',
      String(limit),
      '--json',
      'number,title,body,labels,updatedAt',
    ]);
    const issues = JSON.parse(raw);
    const eligible = issues
      .filter(issue => shouldDispatchIssue(issue))
      .sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt));
    return { success: true, issues: eligible };
  } catch (error) {
    return {
      success: false,
      issues: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** @param {{ title?: string, body?: string | null, labels?: ReadonlyArray<{ name: string }> }} issue */
export function shouldDispatchIssue(issue) {
  const labels = (issue.labels ?? []).map(label => label.name.toLowerCase());
  const text = `${issue.title ?? ''}${issue.body ?? ''}`.toLowerCase();

  if (labels.includes('human-review-required')) return false;
  if ((issue.body ?? '').includes('This issue requires human review')) {
    return false;
  }
  if (labels.includes('type:epic')) return false;
  if (labels.includes('no-auto')) return false;
  if (labels.includes('codex-blocked')) return false;
  if (labels.includes('codex-in-progress')) return false;
  if (
    /lyb-|storekit|revenuecat|body_metric|candidate follow-up|jovieinc\/ci|loop [abc] —/i.test(
      text
    )
  ) {
    return false;
  }

  const hasStatus = labels.some(label => STATUS_LABELS.has(label));
  if (hasStatus) return false;

  return labels.includes(AGENT_READY_LABEL);
}
