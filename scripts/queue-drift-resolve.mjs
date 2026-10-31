#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
// Trusted half of the queue drift precheck (runs from the default branch; the
// PR-authored guards run separately, with no token, in scripts/queue-drift-precheck.mjs).
//   resolve  decide whether the PR has a fresh test merge with main worth checking
//   publish  turn the guards step outcome and report file into job outputs
// Every undecidable case writes run=false / no verdict (fail open): the merge
// group stays the authoritative gate.
// api-budget: github-actions-token 150/hr - about 3 REST reads per green-PR wake (PR, main ref, compare), debounced by the enroll concurrency group
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runGh } from '../packages/api-client/gh.ts';

export const FAILED_MARKER = 'QUEUE_DRIFT_FAILED';
const MAX_REPORT_CHARS = 2000;
const MERGEABLE_ATTEMPTS = 3;

async function ghJson(gh, path) {
  const result = await gh(['api', path], { priority: 'merge' });
  if (result.code !== 0)
    throw new Error(
      `GitHub API ${path} failed (${result.code}): ${result.stderr}`
    );
  return JSON.parse(result.stdout);
}

/** @returns {Promise<{run: boolean, why?: string, number?: number, head?: string, mergeSha?: string}>} */
export async function resolveCandidate({
  number,
  repository,
  gh = runGh,
  sleep = ms => new Promise(done => setTimeout(done, ms)),
}) {
  if (!Number.isSafeInteger(number) || number <= 0) {
    return { run: false, why: 'no single PR attributed to this wake' };
  }
  let pr;
  for (let attempt = 0; attempt < MERGEABLE_ATTEMPTS; attempt += 1) {
    pr = await ghJson(gh, `repos/${repository}/pulls/${number}`);
    if (pr.mergeable !== null) break;
    await sleep(2000); // mergeable is computed lazily; never wait long
  }
  if (
    pr.state !== 'open' ||
    pr.draft ||
    pr.base?.ref !== 'main' ||
    pr.head?.repo?.full_name !== repository
  ) {
    return {
      run: false,
      why: `#${number} is not an open same-repo non-draft PR into main`,
    };
  }
  if (pr.mergeable !== true || !pr.merge_commit_sha) {
    return {
      run: false,
      why: `#${number} has no clean test merge (mergeable=${pr.mergeable}); enroll decides`,
    };
  }
  // The test merge is evidence only if built on today's main and this exact head.
  const main = (await ghJson(gh, `repos/${repository}/git/ref/heads/main`))
    .object.sha;
  const parents = (
    await ghJson(gh, `repos/${repository}/git/commits/${pr.merge_commit_sha}`)
  ).parents.map(parent => parent.sha);
  if (parents[0] !== main || parents[1] !== pr.head.sha) {
    return {
      run: false,
      why: `#${number} test merge is stale (main moved or head changed)`,
    };
  }
  return {
    run: true,
    number,
    head: pr.head.sha,
    mergeSha: pr.merge_commit_sha,
  };
}

/** PR-authored text: bound it, defuse mentions and code fences. */
export function sanitizeReport(raw) {
  return raw
    .replace(new RegExp(`^${FAILED_MARKER}\\n?`), '')
    .slice(0, MAX_REPORT_CHARS)
    .replace(/@/g, '@​')
    .replace(/`{3,}/g, '~~~');
}

/** Only a report written by the precheck script proves drift; crash, timeout or no report is no verdict. */
export function verdict({ outcome, reportText }) {
  if (
    outcome === 'failure' &&
    String(reportText ?? '').startsWith(FAILED_MARKER)
  ) {
    return { status: 'failed', report: sanitizeReport(reportText) };
  }
  if (outcome === 'success') return { status: 'passed' };
  return { status: 'none' };
}

function writeOutputs(file, values) {
  if (!file) return;
  for (const [key, value] of Object.entries(values)) {
    const delimiter = `EOF_${randomBytes(16).toString('hex')}`;
    appendFileSync(file, `${key}<<${delimiter}\n${value}\n${delimiter}\n`);
  }
}

async function main(argv, env) {
  const [command] = argv;
  const out = env.GITHUB_OUTPUT;
  if (command === 'resolve') {
    const outcome = await resolveCandidate({
      number: Number(env.PR_NUMBER || 0),
      repository: env.GITHUB_REPOSITORY,
    });
    console.log(
      outcome.run
        ? `queue-drift: checking #${outcome.number}`
        : `queue-drift: skipped (${outcome.why})`
    );
    writeOutputs(
      out,
      outcome.run
        ? {
            run: 'true',
            number: outcome.number,
            head: outcome.head,
            merge_sha: outcome.mergeSha,
          }
        : { run: 'false' }
    );
    return;
  }
  if (command === 'publish') {
    const file = env.REPORT_FILE;
    const result = verdict({
      outcome: env.GUARDS_OUTCOME,
      reportText: file && existsSync(file) ? readFileSync(file, 'utf8') : '',
    });
    if (result.status === 'failed') {
      console.log(
        `queue-drift: #${env.PR_NUMBER} fails drift-prone guards against latest main`
      );
      writeOutputs(out, {
        failed_pr: env.PR_NUMBER,
        failed_head: env.PR_HEAD,
        report: result.report,
      });
    } else if (result.status === 'passed') {
      writeOutputs(out, { passed_pr: env.PR_NUMBER });
    }
    return;
  }
  throw new Error(`usage: queue-drift-resolve.mjs resolve|publish`);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main(process.argv.slice(2), process.env).catch(error => {
    // Fail open: an error here must never block enrollment.
    console.log(`::warning::queue-drift: ${error.message}; no verdict`);
    writeOutputs(
      process.env.GITHUB_OUTPUT,
      process.argv[2] === 'resolve' ? { run: 'false' } : {}
    );
  });
}
