#!/usr/bin/env node

/**
 * Linear Triage Script
 *
 * Scans all active Linear issues, cross-references with merged PRs on GitHub,
 * moves completed issues to Done, and flags important/stale items.
 *
 * Usage:
 *   LINEAR_API_KEY=lin_... GH_TOKEN=ghp_... node scripts/triage-linear.mjs
 *
 * Or with Doppler:
 *   doppler run -- node scripts/triage-linear.mjs
 *
 * Options:
 *   --dry-run   Show what would be done without making changes (default)
 *   --apply     Actually move issues to Done
 */

const LINEAR_API_KEY = process.env.LINEAR_API_KEY;
const GH_TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const DRY_RUN = !process.argv.includes('--apply');
const TEAM_KEY = 'JOV';
const REPO = 'JovieInc/Jovie';

if (!LINEAR_API_KEY) {
  console.error('ERROR: LINEAR_API_KEY is required');
  console.error(
    '  Set it via env var or use: doppler run -- node scripts/triage-linear.mjs'
  );
  process.exit(1);
}

// ── Linear GraphQL helpers ───────────────────────────────────────────

async function linearQuery(query, variables = {}) {
  const res = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      Authorization: LINEAR_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) {
    console.error('Linear API error:', JSON.stringify(json.errors, null, 2));
    throw new Error('Linear API error');
  }
  return json.data;
}

// ── Fetch all active issues ──────────────────────────────────────────

async function fetchActiveIssues() {
  const query = `
    query ActiveIssues($teamKey: String!, $after: String) {
      team(key: $teamKey) {
        id
        states { nodes { id name type } }
        issues(
          filter: {
            state: { type: { nin: ["completed", "canceled"] } }
          }
          first: 100
          after: $after
          orderBy: updatedAt
        ) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            identifier
            title
            state { id name type }
            priority
            labels { nodes { name } }
            assignee { name }
            createdAt
            updatedAt
            description
          }
        }
      }
    }
  `;

  const allIssues = [];
  let after = null;
  let teamStates = null;

  while (true) {
    const data = await linearQuery(query, { teamKey: TEAM_KEY, after });
    const team = data.team;
    if (!teamStates) teamStates = team.states.nodes;

    allIssues.push(...team.issues.nodes);
    if (!team.issues.pageInfo.hasNextPage) break;
    after = team.issues.pageInfo.endCursor;
  }

  return { issues: allIssues, states: teamStates };
}

// ── Fetch merged PRs from GitHub ─────────────────────────────────────

async function fetchMergedPRs() {
  if (!GH_TOKEN) {
    console.warn('WARN: No GH_TOKEN — skipping GitHub PR cross-reference');
    return [];
  }

  const headers = {
    Authorization: `Bearer ${GH_TOKEN}`,
    Accept: 'application/vnd.github+json',
  };

  // Fetch last 100 merged PRs
  const prs = [];
  for (let page = 1; page <= 3; page++) {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=${page}`,
      { headers }
    );
    const data = await res.json();
    if (!Array.isArray(data)) break;
    const merged = data.filter(pr => pr.merged_at);
    prs.push(...merged);
    if (data.length < 100) break;
  }

  return prs;
}

// ── Extract JOV issue IDs from PR bodies ─────────────────────────────

function extractLinearIds(prBody) {
  if (!prBody) return [];
  const ids = [];

  // linear-issue-id marker
  const idMatch = prBody.match(/linear-issue-id:([^\s>-]+)/);
  if (idMatch) ids.push({ type: 'uuid', value: idMatch[1] });

  // linear-issue-identifier marker
  const identMatch = prBody.match(/linear-issue-identifier:([^\s>-]+)/);
  if (identMatch) ids.push({ type: 'identifier', value: identMatch[1] });

  // JOV-XXXX in title or body
  const jovMatches = prBody.match(/JOV-\d+/g) || [];
  for (const m of jovMatches) {
    ids.push({ type: 'identifier', value: m });
  }

  return ids;
}

// ── Move issue to Done ───────────────────────────────────────────────

async function moveIssueToDone(issueId, doneStateId) {
  if (DRY_RUN) return true;

  const data = await linearQuery(
    `mutation SetDone($issueId: String!, $stateId: String!) {
      issueUpdate(id: $issueId, input: { stateId: $stateId }) { success }
    }`,
    { issueId, stateId: doneStateId }
  );
  return data.issueUpdate?.success;
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log(
    `\n🔍 Linear Triage Script ${DRY_RUN ? '(DRY RUN)' : '(APPLYING CHANGES)'}\n`
  );

  // Step 1: Fetch active issues
  console.log('Fetching active Linear issues...');
  const { issues, states } = await fetchActiveIssues();
  console.log(`  Found ${issues.length} active issues\n`);

  const doneState = states.find(
    s => s.type === 'completed' || s.name.toLowerCase().includes('done')
  );
  if (!doneState) {
    console.error('ERROR: Could not find Done/Completed state');
    process.exit(1);
  }

  // Step 2: Fetch merged PRs
  console.log('Fetching merged PRs from GitHub...');
  const mergedPRs = await fetchMergedPRs();
  console.log(`  Found ${mergedPRs.length} recently merged PRs\n`);

  // Build lookup: identifier -> merged PR info
  const mergedByIdentifier = new Map();
  const mergedByUUID = new Map();
  for (const pr of mergedPRs) {
    const ids = [
      ...extractLinearIds(pr.body || ''),
      ...extractLinearIds(pr.title || ''),
    ];
    for (const id of ids) {
      const info = {
        pr: pr.number,
        title: pr.title,
        mergedAt: pr.merged_at,
        url: pr.html_url,
      };
      if (id.type === 'uuid') mergedByUUID.set(id.value, info);
      if (id.type === 'identifier') mergedByIdentifier.set(id.value, info);
    }
  }

  // Step 3: Categorize issues
  const toMoveToDone = [];
  const flaggedImportant = [];
  const staleIssues = [];
  const skippedHumanReview = [];

  const HUMAN_REVIEW_LABEL = 'human-review-required';
  const HUMAN_REVIEW_TEXT = 'This issue requires human review';
  const STALE_DAYS = 14;
  const now = Date.now();

  for (const issue of issues) {
    const labels = issue.labels.nodes.map(l => l.name);
    const desc = issue.description || '';

    // Skip human-review-required
    if (
      labels.includes(HUMAN_REVIEW_LABEL) ||
      desc.includes(HUMAN_REVIEW_TEXT)
    ) {
      skippedHumanReview.push(issue);
      continue;
    }

    // Check if merged
    const mergedPR =
      mergedByIdentifier.get(issue.identifier) || mergedByUUID.get(issue.id);

    if (mergedPR) {
      toMoveToDone.push({ issue, pr: mergedPR });
      continue;
    }

    // Flag high priority (1=Urgent, 2=High)
    if (issue.priority <= 2 && issue.priority > 0) {
      flaggedImportant.push({
        issue,
        reason: issue.priority === 1 ? 'URGENT priority' : 'HIGH priority',
      });
    }

    // Flag stale (no update in 14+ days)
    const daysSinceUpdate =
      (now - new Date(issue.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceUpdate > STALE_DAYS) {
      staleIssues.push({
        issue,
        daysSinceUpdate: Math.round(daysSinceUpdate),
      });
    }
  }

  // Step 4: Move merged issues to Done
  console.log('═══════════════════════════════════════════════════');
  console.log('  MERGED → MOVE TO DONE');
  console.log('═══════════════════════════════════════════════════\n');

  if (toMoveToDone.length === 0) {
    console.log('  No issues to move — all merged PRs already synced.\n');
  } else {
    for (const { issue, pr } of toMoveToDone) {
      const action = DRY_RUN ? '[DRY RUN] Would move' : 'Moving';
      console.log(`  ${action}: ${issue.identifier} — ${issue.title}`);
      console.log(
        `    Currently: ${issue.state.name} | Merged in: PR #${pr.pr} (${pr.mergedAt})`
      );
      await moveIssueToDone(issue.id, doneState.id);
      console.log(DRY_RUN ? '' : '    ✓ Done');
    }
    console.log(
      `\n  Total: ${toMoveToDone.length} issues ${DRY_RUN ? 'would be' : ''} moved to Done\n`
    );
  }

  // Step 5: Flag important
  console.log('═══════════════════════════════════════════════════');
  console.log('  ⚠️  FLAGGED — IMPORTANT / NEEDS ATTENTION');
  console.log('═══════════════════════════════════════════════════\n');

  if (flaggedImportant.length === 0) {
    console.log('  No urgent/high-priority issues in active states.\n');
  } else {
    for (const { issue, reason } of flaggedImportant) {
      console.log(`  ${issue.identifier} — ${issue.title}`);
      console.log(`    Status: ${issue.state.name} | Reason: ${reason}`);
      console.log(`    Assignee: ${issue.assignee?.name || 'Unassigned'}`);
      console.log();
    }
  }

  // Step 6: Stale issues
  console.log('═══════════════════════════════════════════════════');
  console.log('  🕐 STALE — NO UPDATES IN 14+ DAYS');
  console.log('═══════════════════════════════════════════════════\n');

  if (staleIssues.length === 0) {
    console.log('  No stale issues.\n');
  } else {
    for (const { issue, daysSinceUpdate } of staleIssues) {
      console.log(`  ${issue.identifier} — ${issue.title}`);
      console.log(
        `    Status: ${issue.state.name} | Last updated: ${daysSinceUpdate} days ago`
      );
      console.log(`    Assignee: ${issue.assignee?.name || 'Unassigned'}`);
      console.log();
    }
  }

  // Step 7: Skipped
  if (skippedHumanReview.length > 0) {
    console.log('═══════════════════════════════════════════════════');
    console.log('  SKIPPED — human-review-required');
    console.log('═══════════════════════════════════════════════════\n');
    for (const issue of skippedHumanReview) {
      console.log(`  ${issue.identifier} — ${issue.title}`);
    }
    console.log();
  }

  // Summary
  console.log('═══════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════════\n');
  console.log(`  Active issues scanned:    ${issues.length}`);
  console.log(
    `  Moved to Done:            ${toMoveToDone.length}${DRY_RUN ? ' (dry run)' : ''}`
  );
  console.log(`  Flagged important:        ${flaggedImportant.length}`);
  console.log(`  Stale (14+ days):         ${staleIssues.length}`);
  console.log(`  Skipped (human-review):   ${skippedHumanReview.length}`);
  console.log();

  if (DRY_RUN && toMoveToDone.length > 0) {
    console.log('  Run with --apply to make changes:');
    console.log(
      '    LINEAR_API_KEY=... node scripts/triage-linear.mjs --apply\n'
    );
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
