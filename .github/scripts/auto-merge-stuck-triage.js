#!/usr/bin/env node
// Auto-merge stuck-PR triage.
//
// Finds open, non-draft PRs that have GitHub native auto-merge enabled but have
// not merged after a threshold (default 6h). For each stuck PR it creates or
// updates exactly ONE diagnostic comment (marker: auto-merge-stuck-triage)
// naming the blocker — failing checks, pending checks, conflicts, or a behind
// base branch. It also maintains ONE aggregate tracking issue (marker:
// auto-merge-stuck-tracker) so a repo-wide misconfigured required check
// aggregates instead of spamming. It never closes PRs.
//
// Usage (requires `gh` CLI + GH_TOKEN):
//   node .github/scripts/auto-merge-stuck-triage.js \
//     --repo owner/name [--threshold-hours 6] [--pr 123] [--dry-run]

const { execFileSync } = require('node:child_process');

const COMMENT_MARKER = '<!-- auto-merge-stuck-triage -->';
const ISSUE_MARKER = '<!-- auto-merge-stuck-tracker -->';
const TRACKING_ISSUE_TITLE = 'Auto-merge stuck PRs — diagnostic tracker';

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function ghJson(args) {
  return JSON.parse(gh(args));
}

function ghGraphql(query, variables) {
  const args = ['api', 'graphql', '-f', `query=${query}`];
  for (const [key, value] of Object.entries(variables)) {
    args.push('-F', `${key}=${value}`);
  }
  return ghJson(args).data;
}

function parseArgs(argv) {
  const opts = { thresholdHours: 6, dryRun: false, pr: null, repo: process.env.GH_REPO };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--threshold-hours') opts.thresholdHours = Number(argv[++i]);
    else if (arg === '--pr') opts.pr = Number(argv[++i]);
    else if (arg === '--repo') opts.repo = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!opts.repo) throw new Error('Missing --repo (or GH_REPO env).');
  return opts;
}

const OPEN_PRS_QUERY = `
query($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequests(first: 50, after: $cursor, states: OPEN) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number
        title
        url
        isDraft
        createdAt
        mergeable
        mergeStateStatus
        headRefOid
        autoMergeRequest { enabledAt mergeMethod }
        comments(last: 100) {
          nodes { databaseId body }
        }
      }
    }
  }
}`;

function listOpenPrs(repo) {
  const [owner, name] = repo.split('/');
  const prs = [];
  let cursor = null;
  do {
    const data = ghGraphql(OPEN_PRS_QUERY, { owner, name, cursor });
    const conn = data.repository.pullRequests;
    prs.push(...conn.nodes);
    cursor = conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null;
  } while (cursor);
  return prs;
}

function listCheckRuns(repo, sha) {
  const runs = [];
  let page = 1;
  for (;;) {
    const batch = ghJson([
      'api',
      `repos/${repo}/commits/${sha}/check-runs?per_page=100&page=${page}`,
    ]);
    runs.push(...batch.check_runs);
    if (batch.check_runs.length < 100) break;
    page += 1;
  }
  return runs;
}

// Pure: given a PR node and its head check runs, explain why it has not merged.
function diagnoseStuckPr(pr, checkRuns) {
  const failing = checkRuns.filter(
    r => r.status === 'completed' && ['failure', 'cancelled', 'timed_out', 'action_required'].includes(r.conclusion)
  );
  const pending = checkRuns.filter(r => r.status !== 'completed');
  const reasons = [];

  if (pr.mergeable === 'CONFLICTING' || pr.mergeStateStatus === 'DIRTY') {
    reasons.push('merge conflicts with the base branch');
  }
  if (pr.mergeStateStatus === 'BEHIND') {
    reasons.push('head is behind the base branch (needs update/rebase)');
  }
  if (failing.length > 0) {
    reasons.push(
      `failing checks: ${failing.map(r => `[${r.name}](${r.html_url || r.details_url || 'no-url'})`).join(', ')}`
    );
  }
  if (pending.length > 0) {
    reasons.push(
      `checks still pending or never reported: ${pending.map(r => r.name).join(', ')}`
    );
  }
  if (pr.mergeStateStatus === 'BLOCKED' && failing.length === 0 && pending.length === 0) {
    reasons.push('blocked by branch protection (required check not reporting or review gate)');
  }
  if (reasons.length === 0) {
    reasons.push(`no failing or pending checks detected (mergeStateStatus=${pr.mergeStateStatus}) — GitHub auto-merge may be waiting on a required check that is not reporting`);
  }
  return { reasons, failing, pending };
}

// Pure: render the single diagnostic comment body.
function buildCommentBody(pr, diagnosis, thresholdHours) {
  const lines = [
    COMMENT_MARKER,
    `**Auto-merge has been enabled for over ${thresholdHours}h but this PR has not merged.**`,
    '',
    'Blocker(s) detected:',
    ...diagnosis.reasons.map(r => `- ${r}`),
    '',
    '_This comment is maintained by `.github/workflows/auto-merge-default.yml`. It updates in place; PRs are never auto-closed._',
  ];
  return lines.join('\n');
}

function findMarkerComment(pr) {
  return (pr.comments?.nodes || []).find(c => c.body && c.body.includes(COMMENT_MARKER));
}

function upsertComment(repo, pr, body, dryRun) {
  const existing = findMarkerComment(pr);
  if (dryRun) {
    console.log(`[dry-run] would ${existing ? 'update' : 'create'} diagnostic comment on PR #${pr.number}`);
    return;
  }
  if (existing) {
    if (existing.body === body) {
      console.log(`PR #${pr.number}: diagnostic comment already current.`);
      return;
    }
    gh(['api', `repos/${repo}/issues/comments/${existing.databaseId}`, '-X', 'PATCH', '-F', `body=${body}`]);
    console.log(`PR #${pr.number}: updated diagnostic comment.`);
  } else {
    gh(['pr', 'comment', String(pr.number), '--repo', repo, '--body', body]);
    console.log(`PR #${pr.number}: created diagnostic comment.`);
  }
}

function findTrackingIssue(repo) {
  const result = ghJson([
    'api',
    `search/issues?q=${encodeURIComponent(`repo:${repo} is:issue ${ISSUE_MARKER}`)}&per_page=5`,
  ]);
  return (result.items || []).find(i => i.state === 'open') || result.items?.[0] || null;
}

function buildIssueBody(stuck) {
  const lines = [
    ISSUE_MARKER,
    'Aggregate tracker for PRs with auto-merge enabled that have not merged. Maintained by `.github/workflows/auto-merge-default.yml`.',
    '',
  ];
  if (stuck.length === 0) {
    lines.push('No stuck PRs detected in the latest sweep.');
  } else {
    lines.push(`**${stuck.length} stuck PR(s):**`, '');
    for (const s of stuck) {
      lines.push(`- [#${s.pr.number}](${s.pr.url}) ${s.pr.title} — ${s.diagnosis.reasons.join('; ')}`);
    }
  }
  return lines.join('\n');
}

function upsertTrackingIssue(repo, stuck, dryRun) {
  const issue = findTrackingIssue(repo);
  const body = buildIssueBody(stuck);
  if (dryRun) {
    console.log(`[dry-run] would ${issue ? `update issue #${issue.number}` : 'create tracking issue'} (${stuck.length} stuck PRs)`);
    return;
  }
  if (!issue && stuck.length === 0) return;
  if (!issue) {
    gh(['issue', 'create', '--repo', repo, '--title', TRACKING_ISSUE_TITLE, '--body', body]);
    console.log('Created tracking issue.');
    return;
  }
  if (stuck.length === 0 && issue.state === 'open') {
    gh(['issue', 'close', String(issue.number), '--repo', repo, '--comment', 'No stuck PRs remain. Closing.']);
    console.log(`Closed tracking issue #${issue.number}.`);
    return;
  }
  if (issue.state === 'closed' && stuck.length > 0) {
    gh(['issue', 'reopen', String(issue.number), '--repo', repo]);
  }
  gh(['issue', 'edit', String(issue.number), '--repo', repo, '--body', body]);
  console.log(`Updated tracking issue #${issue.number}.`);
}

function main() {
  const opts = parseArgs(process.argv);
  const cutoffMs = Date.now() - opts.thresholdHours * 3600 * 1000;

  let prs = listOpenPrs(opts.repo).filter(
    pr => !pr.isDraft && pr.autoMergeRequest && pr.autoMergeRequest.enabledAt
  );
  if (opts.pr) prs = prs.filter(pr => pr.number === opts.pr);

  const stuck = [];
  for (const pr of prs) {
    const enabledAt = Date.parse(pr.autoMergeRequest.enabledAt);
    const isStuck = enabledAt <= cutoffMs;
    const hasComment = Boolean(findMarkerComment(pr));

    if (!isStuck) {
      if (hasComment && !opts.dryRun) {
        const body = `${COMMENT_MARKER}\nResolved — this PR is no longer stuck (auto-merge pending normally or merged).`;
        gh(['api', `repos/${opts.repo}/issues/comments/${findMarkerComment(pr).databaseId}`, '-X', 'PATCH', '-F', `body=${body}`]);
      }
      continue;
    }

    const checkRuns = listCheckRuns(opts.repo, pr.headRefOid);
    const diagnosis = diagnoseStuckPr(pr, checkRuns);
    console.log(`PR #${pr.number} stuck since ${pr.autoMergeRequest.enabledAt}: ${diagnosis.reasons.join('; ')}`);
    upsertComment(opts.repo, pr, buildCommentBody(pr, diagnosis, opts.thresholdHours), opts.dryRun);
    stuck.push({ pr, diagnosis });
  }

  if (!opts.pr) {
    upsertTrackingIssue(opts.repo, stuck, opts.dryRun);
  }
  console.log(`Triage complete. Stuck PRs: ${stuck.length}.`);
}

if (require.main === module) {
  main();
}

module.exports = {
  COMMENT_MARKER,
  ISSUE_MARKER,
  TRACKING_ISSUE_TITLE,
  parseArgs,
  diagnoseStuckPr,
  buildCommentBody,
  buildIssueBody,
  findMarkerComment,
};
