#!/usr/bin/env node
/**
 * Alarm when release-worthy PRs live in production have gone unpublished for
 * more than 24h. Prints JSON; with GITHUB_OUTPUT set, also writes status and
 * detail for the remediation (Summer signal) step.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { runGh } from '../packages/api-client/gh.ts';
import { evaluateChangelogStaleness } from './lib/changelog-staleness.mjs';
import { extractDailyReceipts } from './lib/daily-changelog.mjs';
import { readCustomerNote } from './lib/daily-changelog-publication.mjs';

const run = (cmd, args) =>
  execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
/** @type {{ commitSha?: unknown }} */
const live = await (
  await fetch('https://jov.ie/api/health/build-info', {
    signal: AbortSignal.timeout(15000),
  })
).json();
const liveSha = String(live.commitSha ?? '');
if (!/^[a-f0-9]{40}$/.test(liveSha))
  throw new Error('Live build identity unavailable');

const receipts = extractDailyReceipts(readFileSync('CHANGELOG.md', 'utf8'));
const latest = receipts.find(receipt => receipt.publicationHead);
// Stories, exclusions and already-processed ids are settled; only unsettled PRs wait.
const settled = new Set(
  receipts.flatMap(receipt =>
    [
      ...(receipt.sourceReceiptIds ?? []),
      ...(receipt.exclusions ?? []).map(item => JSON.stringify(item)),
      ...(receipt.alreadyProcessed ?? []),
    ].flatMap(value =>
      [...String(value).matchAll(/#(\d+)/g)].map(m => Number(m[1]))
    )
  )
);
const range = latest?.publicationHead
  ? `${latest.publicationHead}..${liveSha}`
  : liveSha;
const args = ['log', '--first-parent', '--format=%s', '--max-count=2000'];
if (!latest?.publicationHead) args.push('--since=2026-08-31T00:00:00Z');
const numbers = [
  ...new Set(
    run('git', [...args, range])
      .trim()
      .split('\n')
      .flatMap(subject => {
        const n = /\(#(\d+)\)$/.exec(subject)?.[1];
        return n && !settled.has(Number(n)) ? [Number(n)] : [];
      })
  ),
];
const liveWorthy = [];
for (let i = 0; i < numbers.length; i += 50) {
  const batch = numbers.slice(i, i + 50);
  const fields = batch
    .map(n => `p${n}:pullRequest(number:${n}){number mergedAt body}`)
    .join('\n');
  const result = await runGh(
    [
      'api',
      'graphql',
      '-f',
      `query=query { repository(owner:"JovieInc",name:"Jovie") { ${fields} } }`,
    ],
    { priority: 'report' }
  );
  if (result.code !== 0)
    throw new Error(`GitHub read failed (exit ${result.code})`);
  const response = JSON.parse(result.stdout);
  for (const n of batch) {
    const pr = response.data?.repository?.[`p${n}`];
    if (pr?.mergedAt && readCustomerNote(pr.body).note)
      liveWorthy.push({ number: pr.number, mergedAt: pr.mergedAt });
  }
}
const result = evaluateChangelogStaleness({
  liveWorthy,
  lastPublishedAt: latest?.evaluatedAt ?? null,
  now: new Date().toISOString(),
});
const detail =
  result.status === 'stale'
    ? `${result.waiting} release-worthy change(s) live in production for ${result.ageHours}h with no customer changelog entry (oldest PR #${result.oldestPr}). Check the open daily-changelog release PR and the Production Controller publish job.`
    : 'Customer changelog is current.';
console.log(JSON.stringify({ ...result, detail }));
if (process.env.GITHUB_OUTPUT)
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `status=${result.status}\nconclusion=${result.status === 'stale' ? 'failure' : 'success'}\ndetail=${detail}\n`
  );
