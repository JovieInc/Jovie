#!/usr/bin/env node
/**
 * Ship-swarm intake: pick N eligible Linear issues, dedupe open PRs, emit JSON.
 *
 * Usage:
 *   doppler run -- node scripts/ship-swarm/next-batch.mjs --concurrency 5
 *   doppler run -- node scripts/ship-swarm/next-batch.mjs --concurrency 3 --issues JOV-3591,JOV-3125
 */
import { execSync } from 'node:child_process';

const args = process.argv.slice(2);

function readArg(name, fallback = null) {
  const idx = args.indexOf(name);
  if (idx === -1) return fallback;
  return args[idx + 1] ?? fallback;
}

const concurrency = Math.min(
  8,
  Math.max(1, Number.parseInt(readArg('--concurrency', '5'), 10) || 5)
);
const issuesArg = readArg('--issues', '');
const explicitIds = issuesArg
  ? issuesArg
      .split(',')
      .map(s => s.trim().toUpperCase())
      .filter(Boolean)
  : [];

const key = process.env.LINEAR_API_KEY;
if (!key) {
  console.error('LINEAR_API_KEY missing (use doppler run)');
  process.exit(1);
}

async function gql(query, variables = {}) {
  const res = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: key },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new Error(`Linear API ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  if (data.errors) throw new Error(JSON.stringify(data.errors));
  return data.data;
}

function shouldSkip(issue) {
  const labels = (issue.labels?.nodes ?? []).map(l => l.name.toLowerCase());
  const text = `${issue.title} ${issue.description ?? ''}`.toLowerCase();
  if (labels.includes('human-review-required')) return true;
  if ((issue.description ?? '').includes('This issue requires human review'))
    return true;
  if (labels.includes('type:epic')) return true;
  if (
    /lyb-|storekit|revenuecat|body_metric|jovieinc\/ci|loop [abc] —/i.test(text)
  )
    return true;
  return false;
}

function openPrBranches() {
  try {
    const raw = execSync(
      'gh pr list --state open --json headRefName --jq ".[].headRefName"',
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    return new Set(
      raw
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean)
    );
  } catch {
    return new Set();
  }
}

function hasOpenPr(identifier, branches) {
  const num = identifier.replace(/^JOV-/i, '');
  for (const b of branches) {
    if (b.includes(`jov-${num}`) || b.includes(`JOV-${num}`)) return true;
  }
  return false;
}

async function fetchIssue(identifier) {
  const m = identifier.match(/^JOV-(\d+)$/i);
  if (!m) return null;
  const { issues } = await gql(
    `query($n: Float!) {
      issues(filter: { team: { key: { eq: "JOV" } }, number: { eq: $n } }, first: 1) {
        nodes {
          identifier title description priority priorityLabel branchName url
          labels { nodes { name } }
        }
      }
    }`,
    { n: Number.parseInt(m[1], 10) }
  );
  return issues?.nodes?.[0] ?? null;
}

async function fetchTodoCandidates(limit) {
  const { issues } = await gql(
    `query($first: Int!) {
      issues(
        filter: { team: { key: { eq: "JOV" } }, state: { name: { in: ["Todo", "Triage", "Backlog", "In Progress"] } } }
        first: $first
        orderBy: updatedAt
      ) {
        nodes {
          identifier title description priority priorityLabel branchName url
          labels { nodes { name } }
        }
      }
    }`,
    { first: Math.max(limit * 3, 40) }
  );
  return (issues?.nodes ?? [])
    .filter(i => !shouldSkip(i))
    .sort((a, b) => (a.priority ?? 4) - (b.priority ?? 4));
}

const openBranches = openPrBranches();
let candidates = [];

if (explicitIds.length > 0) {
  for (const id of explicitIds) {
    const issue = await fetchIssue(id);
    if (!issue) continue;
    if (shouldSkip(issue)) continue;
    candidates.push(issue);
  }
} else {
  candidates = await fetchTodoCandidates(concurrency);
}

const selected = [];
for (const issue of candidates) {
  if (selected.length >= concurrency) break;
  if (hasOpenPr(issue.identifier, openBranches)) continue;
  const num = issue.identifier.replace(/^JOV-/i, '').toLowerCase();
  selected.push({
    id: issue.identifier,
    title: issue.title,
    url: issue.url,
    priority: issue.priorityLabel,
    branch:
      issue.branchName ??
      `tim/jov-${num}-${issue.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 40)
        .replace(/-+$/, '')}`,
    worktree: `/tmp/jovie-worktrees/jov-${num}`,
    description: (issue.description ?? '').slice(0, 2000),
    labels: (issue.labels?.nodes ?? []).map(l => l.name),
  });
}

console.log(
  JSON.stringify(
    {
      concurrency,
      selected: selected.length,
      issues: selected,
      skippedOpenPr: candidates.length - selected.length,
    },
    null,
    2
  )
);
