#!/usr/bin/env node
/**
 * Census of the failed PR runs caused by the three avoidable body/story reds (missing customer-changelog decision,
 * missing Red-before-green, missing Storybook story), so the before/after of scripts/pr-create.mjs is a number.
 *
 *   node scripts/pr-red-census.mjs [--hours 24] [--max-logs 120] [--out file.json]
 *
 * One list call per workflow plus one log read per failed run (the shared GitHub quota is the cost; --max-logs bounds it
 * and the unread remainder is reported as `unclassified`).
 */
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { runGh } from '../packages/api-client/gh.ts';

export const WORKFLOWS = ['PR Fleet Rules', 'Source Validation'];
export const CAUSES = [
  ['red-before-green', /red-before-green/i],
  [
    'changelog',
    /customer outcome decision missing|customer[- ]changelog|changelog decision|customer-note/i,
  ],
  [
    'story',
    /component[- ]ship[- ]gate|missing (?:a )?stor(?:y|ies)|\.stories\./i,
  ],
];

export const classify = log =>
  CAUSES.filter(([, pattern]) => pattern.test(log)).map(([name]) => name);

export async function census({
  hours = 24,
  maxLogs = 120,
  gh = async args => (await runGh(args, { priority: 'poll' })).stdout,
  now = Date.now(),
} = {}) {
  const since = new Date(now - hours * 3600e3).toISOString();
  const runs = [];
  for (const workflow of WORKFLOWS) {
    const rows = JSON.parse(
      await gh([
        'run',
        'list',
        '-R',
        'JovieInc/Jovie',
        '--workflow',
        workflow,
        '--created',
        `>=${since}`,
        '--limit',
        '500',
        '--json',
        'databaseId,conclusion,event,headBranch',
      ])
    );
    for (const row of rows) runs.push({ ...row, workflow });
  }
  const byWorkflow = WORKFLOWS.map(workflow =>
    runs.filter(
      run =>
        run.workflow === workflow &&
        run.conclusion === 'failure' &&
        run.event === 'pull_request'
    )
  );
  // Interleave the workflows so a log-read cap samples every workflow, not just the first one listed.
  const failed = [];
  for (let i = 0; byWorkflow.some(list => i < list.length); i++)
    for (const list of byWorkflow) if (i < list.length) failed.push(list[i]);
  const causes = { 'red-before-green': 0, changelog: 0, story: 0 };
  const branches = new Set();
  let read = 0;
  let unclassified = 0;
  for (const run of failed) {
    if (read >= maxLogs) {
      unclassified++;
      continue;
    }
    read++;
    let log = '';
    try {
      log = await gh([
        'run',
        'view',
        String(run.databaseId),
        '-R',
        'JovieInc/Jovie',
        '--log-failed',
      ]);
    } catch {
      unclassified++;
      continue;
    }
    const found = classify(log);
    for (const name of found) causes[name]++;
    if (found.length) branches.add(run.headBranch);
  }
  const caused = Object.values(causes).reduce((a, b) => a + b, 0);
  return {
    since,
    hours,
    failedPrRuns: failed.length,
    logsRead: read,
    unclassified,
    causes,
    causeHits: caused,
    distinctBranches: branches.size,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const args = process.argv.slice(2);
  const value = (name, fallback) =>
    args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
  const result = await census({
    hours: Number(value('--hours', 24)),
    maxLogs: Number(value('--max-logs', 120)),
  });
  const out = value('--out');
  if (out) writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result));
}
