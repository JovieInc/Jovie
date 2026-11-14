#!/usr/bin/env node
// api-budget: github-actions-token 10/hr - planned ten failed main Visual completions/hour, one exact-attempt read each; no retries or polling
// This admits a refresh notification, never a component PASS or completeness claim.
import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  acceptStoryReceipts,
  STORY_EVIDENCE_SCHEMA,
} from './component-evidence.mjs';
import {
  renderReceiptCurrent,
  snapshotRenderInputs,
} from './component-render-inputs.mjs';

const WORKFLOW = '.github/workflows/visual-a11y.yml';
const WORKFLOW_NAME = 'Visual & A11y Tests';
const CHILD_NAME = 'Component Story Evidence';
const positiveId = value => Number.isSafeInteger(value) && value > 0;
const requireProof = (condition, reason) => {
  if (!condition) throw new Error(reason);
};

export async function verifiedStoryCacheKey(
  { repository, ref, eventName, event },
  api
) {
  const run = event?.workflow_run;
  requireProof(
    repository === 'JovieInc/Jovie' &&
      ref === 'refs/heads/main' &&
      eventName === 'workflow_run' &&
      event?.repository?.full_name === repository &&
      positiveId(event.repository.id) &&
      run?.repository?.id === event.repository.id &&
      run.repository.full_name === repository &&
      run.head_repository?.id === event.repository.id &&
      run.head_repository.full_name === repository &&
      run.head_branch === 'main' &&
      /^[0-9a-f]{40}$/.test(run.head_sha ?? '') &&
      positiveId(run.id) &&
      positiveId(run.run_attempt) &&
      positiveId(run.workflow_id) &&
      run.path === WORKFLOW &&
      run.name === WORKFLOW_NAME &&
      run.status === 'completed' &&
      run.conclusion === 'failure' &&
      ['push', 'workflow_dispatch', 'workflow_run'].includes(run.event),
    'untrusted failed story workflow completion'
  );
  // The existing producer has 19 jobs. Refuse a truncated listing rather than
  // infer uniqueness across unseen pages or use another attempt's retained job.
  const listing = await api(
    `repos/${repository}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`
  );
  const jobs = listing?.jobs;
  requireProof(
    Array.isArray(jobs) &&
      jobs.length > 0 &&
      jobs.length <= 100 &&
      listing.total_count === jobs.length &&
      new Set(jobs.map(job => job?.id)).size === jobs.length &&
      jobs.every(
        job =>
          positiveId(job?.id) &&
          job.run_id === run.id &&
          job.run_attempt === run.run_attempt &&
          job.head_sha === run.head_sha &&
          job.head_branch === 'main'
      ),
    'incomplete or mismatched exact-attempt job listing'
  );
  const children = jobs.filter(job => job.name === CHILD_NAME);
  requireProof(
    children.length === 1 &&
      children[0].status === 'completed' &&
      children[0].conclusion === 'success',
    'exact canonical story child did not complete successfully'
  );
  return `component-story-evidence-${run.id}-${run.run_attempt}`;
}

/** Reject a stale notification before it can replace a current certificate. */
export function requireCurrentStoryCache(root, directory) {
  const checkout = realpathSync(root);
  const snapshot = snapshotRenderInputs(root);
  requireProof(
    !snapshot.problem && snapshot.binding,
    'current render inputs unavailable'
  );
  let cohort;
  for (const kind of ['visual', 'a11y']) {
    const records = JSON.parse(
      readFileSync(join(directory, `${kind}.json`), 'utf8')
    ).components;
    requireProof(
      records && typeof records === 'object' && !Array.isArray(records),
      'invalid capture component records'
    );
    const paths = Object.keys(records).sort();
    requireProof(
      paths.length > 0 && (!cohort || JSON.stringify(paths) === cohort),
      'missing or inconsistent capture component records'
    );
    cohort = JSON.stringify(paths);
    const accepted = acceptStoryReceipts(records);
    requireProof(accepted.rejected.length === 0, 'rejected capture receipt');
    for (const path of paths) {
      const file = resolve(root, path);
      const within = relative(checkout, realpathSync(file));
      requireProof(
        !isAbsolute(path) &&
          relative(resolve(root), file) === path &&
          within &&
          within !== '..' &&
          !within.startsWith('../') &&
          !isAbsolute(within),
        'capture component outside checkout'
      );
      const receipt = accepted.components[path];
      const sourceHash = createHash('sha256')
        .update(readFileSync(file))
        .digest('hex');
      requireProof(
        receipt.schema === STORY_EVIDENCE_SCHEMA &&
          renderReceiptCurrent(receipt, sourceHash, snapshot.binding),
        'stale or invalid capture source/render binding'
      );
    }
  }
}

async function main() {
  if (process.argv[2] === '--require-current-cache') {
    requireCurrentStoryCache(process.cwd(), process.env.STORY_CACHE_DIR);
    return;
  }
  const { runGh } = await import('../../packages/api-client/gh.ts');
  const cacheKey = await verifiedStoryCacheKey(
    {
      repository: process.env.GITHUB_REPOSITORY,
      ref: process.env.GITHUB_REF,
      eventName: process.env.GITHUB_EVENT_NAME,
      event: JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')),
    },
    async route => {
      const result = await runGh(['api', route], {
        priority: 'report',
        maxAttempts: 1,
        maxWaitMs: 0,
      });
      if (result.code !== 0) {
        process.exitCode = result.code;
        throw new Error('canonical story child API proof unavailable');
      }
      return JSON.parse(result.stdout);
    }
  );
  appendFileSync(process.env.GITHUB_OUTPUT, `cache-key=${cacheKey}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(error => {
    console.error(error.message);
    process.exitCode ||= 1;
  });
