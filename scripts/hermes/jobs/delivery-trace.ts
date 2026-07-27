#!/usr/bin/env tsx
/**
 * Gem delivery trace — read-only exact issue-to-production receipts.
 *
 * This job never mutates GitHub, the queue, or production. It is deliberately
 * fail-loud in its output: missing links and incomplete exact-SHA receipts are
 * recorded as incomplete rather than treated as shipped.
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildDeliveryTrace,
  type DeliveryTracePr,
  type ProductionControllerReceipt,
  renderDeliveryTrace,
} from '../lib/delivery-trace';
import { gbrainLearn } from '../lib/gbrain';
import { HERMES_PATHS } from '../lib/hermes-paths';
import { logJobEvent, withJobLogging } from '../lib/jobs-log';

const JOB = 'delivery-trace';
const REPO = process.env.HERMES_GITHUB_REPO ?? 'JovieInc/Jovie';
const LIMIT = Number(process.env.HERMES_DELIVERY_TRACE_LIMIT ?? '25');
const TRACE_JSONL = join(HERMES_PATHS.stateDir, 'delivery-trace.jsonl');
const TRACE_LATEST = join(HERMES_PATHS.stateDir, 'delivery-trace-latest.json');

function gh(args: readonly string[], timeoutMs = 30_000): string {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
  });
}

function fetchMergedPrs(): DeliveryTracePr[] {
  const prs = JSON.parse(
    gh([
      'pr',
      'list',
      '--repo',
      REPO,
      '--state',
      'merged',
      '--limit',
      String(LIMIT),
      '--json',
      'number,url,mergeCommit,mergedAt,closingIssuesReferences',
    ])
  ) as Array<{
    number: number;
    url: string;
    mergeCommit: { oid?: string } | null;
    mergedAt: string | null;
    closingIssuesReferences?: Array<{ number?: number }>;
  }>;
  return prs.map(pr => ({
    number: pr.number,
    url: pr.url,
    mergeSha: pr.mergeCommit?.oid ?? null,
    mergedAt: pr.mergedAt,
    closingIssueNumbers: (pr.closingIssuesReferences ?? [])
      .map(issue => issue.number)
      .filter((number): number is number => typeof number === 'number'),
  }));
}

function fetchControllerRuns(): ProductionControllerReceipt[] {
  const runs = JSON.parse(
    gh([
      'run',
      'list',
      '--repo',
      REPO,
      '--workflow',
      'production-controller.yml',
      '--limit',
      String(LIMIT * 4),
      '--json',
      'databaseId,headSha,status,conclusion,updatedAt',
    ])
  ) as Array<{
    databaseId: number;
    headSha: string;
    status: 'queued' | 'in_progress' | 'completed';
    conclusion: string | null;
    updatedAt: string;
  }>;

  return runs.map(run => {
    let productionVerifiedConclusion: string | null = null;
    if (run.status === 'completed') {
      try {
        const detail = JSON.parse(
          gh([
            'run',
            'view',
            String(run.databaseId),
            '--repo',
            REPO,
            '--json',
            'jobs',
          ])
        ) as { jobs?: Array<{ name?: string; conclusion?: string | null }> };
        productionVerifiedConclusion =
          detail.jobs?.find(job => job.name === 'Production Verified')
            ?.conclusion ?? null;
      } catch {
        productionVerifiedConclusion = null;
      }
    }
    return { ...run, runId: run.databaseId, productionVerifiedConclusion };
  });
}

async function main(): Promise<void> {
  await withJobLogging(JOB, async () => {
    const generatedAt = new Date().toISOString();
    const trace = buildDeliveryTrace({
      generatedAt,
      mergedPrs: fetchMergedPrs(),
      controllerReceipts: fetchControllerRuns(),
    });
    const body = renderDeliveryTrace(trace);
    mkdirSync(HERMES_PATHS.stateDir, { recursive: true });
    appendFileSync(TRACE_JSONL, `${JSON.stringify(trace)}\n`);
    writeFileSync(TRACE_LATEST, `${JSON.stringify(trace, null, 2)}\n`);
    const gbrainOk = gbrainLearn({
      slug: 'ops/delivery-trace/latest',
      title: 'Exact issue-to-production delivery trace',
      body,
      tags: ['type:delivery-trace', 'owner:gem'],
      type: 'delivery-trace',
    });
    logJobEvent({
      job: JOB,
      event: 'traced',
      complete: trace.summary.complete,
      incomplete: trace.summary.incomplete,
      unlinked: trace.summary.unlinked,
      gbrainOk,
    });
    process.stdout.write(`${body}\n`);
  });
}

void main().catch(err => {
  const error = err instanceof Error ? err.message : String(err);
  logJobEvent({ job: JOB, event: 'fatal', error });
  console.error(`[${JOB}] fatal:`, err);
  process.exit(1);
});
