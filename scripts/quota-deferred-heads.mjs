#!/usr/bin/env node
// Metric + alert: open PR heads whose PR Fleet Rules run failed only on the
// github-quota-deferred marker and has stayed red past the age limit. A
// quota-deferred result is infrastructure, never a verdict, and the lane relay
// must have re-run it (lane-fix-relay.yml subscribes to PR Fleet Rules). Any
// head older than 1h means that re-run path is broken.
//
// CLI: node scripts/quota-deferred-heads.mjs [--max-age-minutes 60]
//   prints {"metric":"quota_deferred_heads_older_than_1h","value":N,"heads":[...]}
//   and exits 1 when N > 0 (the alert), 0 otherwise.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const QUOTA_DEFERRED_MARKER = 'github-quota-deferred';
export const CHECK_NAME = 'PR Fleet Rules';

/** rows: [{ number, headSha, completedAt, conclusion, annotations: string[] }] */
export function staleQuotaDeferredHeads(rows, nowMs, maxAgeMs = 3600_000) {
  return rows
    .filter(
      row =>
        String(row.conclusion).toLowerCase() === 'failure' &&
        (row.annotations ?? []).some(m => m.includes(QUOTA_DEFERRED_MARKER)) &&
        nowMs - Date.parse(row.completedAt) > maxAgeMs
    )
    .map(row => ({
      number: row.number,
      headSha: row.headSha,
      ageMinutes: Math.round((nowMs - Date.parse(row.completedAt)) / 60000),
    }));
}

export function metric(rows, nowMs, maxAgeMs) {
  const heads = staleQuotaDeferredHeads(rows, nowMs, maxAgeMs);
  return {
    metric: 'quota_deferred_heads_older_than_1h',
    value: heads.length,
    heads,
  };
}

const gh = args =>
  execFileSync('gh', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

function liveRows(repo = process.env.GITHUB_REPOSITORY ?? 'JovieInc/Jovie') {
  const [owner, name] = repo.split('/');
  const query = `query($after:String){repository(owner:"${owner}",name:"${name}"){pullRequests(states:OPEN,first:25,after:$after,orderBy:{field:UPDATED_AT,direction:DESC}){pageInfo{hasNextPage endCursor} nodes{number isDraft headRefOid commits(last:1){nodes{commit{statusCheckRollup{contexts(first:60){nodes{... on CheckRun{name conclusion completedAt detailsUrl}}}}}}}}}}}`;
  const prs = [];
  let after = '';
  for (let page = 0; page < 20; page += 1) {
    const args = ['api', 'graphql', '-f', `query=${query}`];
    if (after) args.push('-f', `after=${after}`);
    const { nodes, pageInfo } = JSON.parse(gh(args)).data.repository
      .pullRequests;
    prs.push(...nodes);
    if (!pageInfo.hasNextPage) break;
    after = pageInfo.endCursor;
  }
  const rows = [];
  for (const pr of prs) {
    const contexts =
      pr.commits.nodes[0]?.commit.statusCheckRollup?.contexts.nodes ?? [];
    // The rollup can surface an older failed run of the same name; only the
    // newest run for the head decides, so confirm it through the check-runs API.
    if (
      pr.isDraft ||
      !contexts.some(c => c.name === CHECK_NAME && c.conclusion === 'FAILURE')
    )
      continue;
    const runs = JSON.parse(
      gh([
        'api',
        `repos/${repo}/commits/${pr.headRefOid}/check-runs?check_name=${encodeURIComponent(CHECK_NAME)}&per_page=50`,
      ])
    ).check_runs.sort(
      (a, b) => Date.parse(b.started_at) - Date.parse(a.started_at)
    );
    const check = runs[0];
    if (check?.conclusion !== 'failure') continue;
    const annotations = JSON.parse(
      gh(['api', `repos/${repo}/check-runs/${check.id}/annotations`])
    ).map(a => a.message ?? '');
    rows.push({
      number: pr.number,
      headSha: pr.headRefOid,
      completedAt: check.completed_at,
      conclusion: check.conclusion,
      annotations,
    });
  }
  return rows;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const flag = process.argv.indexOf('--max-age-minutes');
  const minutes = flag > 0 ? Number(process.argv[flag + 1]) : 60;
  const result = metric(liveRows(), Date.now(), minutes * 60_000);
  console.log(JSON.stringify(result));
  process.exit(result.value > 0 ? 1 : 0);
}
