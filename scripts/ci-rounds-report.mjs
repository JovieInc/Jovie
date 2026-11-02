#!/usr/bin/env node
/**
 * CI rounds per merged PR: how many PR head commits Source Validation ran on,
 * as p50/p95.
 * A "round" is one head push that went through CI; fewer is better, and the
 * target of `pnpm preflight` is to push the p50 toward 1.
 *
 * Usage: node scripts/ci-rounds-report.mjs [--prs 25] [--json]
 *
 * Cost: 1 GraphQL call, through the enforced client
 * layer (packages/api-client). Check the GitHub core rate limit first for bulk use.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'JovieInc/Jovie';

/** Nearest-rank percentile of a numeric list; null when empty. */
export function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1];
}

/**
 * prs: [{ number, commits: { nodes: [{ commit: { oid, checkSuites: { nodes:
 * [{ workflowRun: { workflow: { name } } }] } } }] } }].
 * A round is a PR head commit that Source Validation ran on.
 */
export function summarizeRounds(prs, workflowName = 'Source Validation') {
  const rows = prs.map(pr => ({
    number: pr.number,
    commits: pr.commits.nodes.length,
    rounds: pr.commits.nodes.filter(n =>
      n.commit.checkSuites.nodes.some(
        s => s.workflowRun?.workflow?.name === workflowName
      )
    ).length,
  }));
  const rounds = rows.map(r => r.rounds);
  return {
    prs: rows.length,
    roundsP50: percentile(rounds, 50),
    roundsP95: percentile(rounds, 95),
    rows,
  };
}

function gh(args) {
  const out = execFileSync(
    'node',
    [
      path.join(ROOT, 'packages/api-client/cli.ts'),
      'gh',
      '--priority',
      'default',
      '--',
      ...args,
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, cwd: ROOT }
  );
  return JSON.parse(out);
}

export function fetchData({ prs = 25, call = gh } = {}) {
  const [owner, name] = REPO.split('/');
  const query = `query { repository(owner:"${owner}", name:"${name}") { pullRequests(states: MERGED, last: ${prs}, orderBy:{field:UPDATED_AT, direction:ASC}) { nodes { number commits(first: 50) { nodes { commit { oid checkSuites(first: 30, filterBy: {appId: 15368}) { nodes { workflowRun { workflow { name } } } } } } } } } } }`;
  const res = call(['api', 'graphql', '-f', `query=${query}`]);
  return res.data.repository.pullRequests.nodes;
}

function main(argv = process.argv.slice(2)) {
  const at = argv.indexOf('--prs');
  const prs = at >= 0 ? Number(argv[at + 1]) : 25;
  const summary = summarizeRounds(fetchData({ prs }));
  if (argv.includes('--json')) {
    console.log(JSON.stringify(summary));
    return;
  }
  console.log(
    `CI rounds (Source Validation head commits) over the last ${summary.prs} merged PRs:`
  );
  console.log(`  p50=${summary.roundsP50}  p95=${summary.roundsP95}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
