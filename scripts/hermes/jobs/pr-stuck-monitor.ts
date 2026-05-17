#!/usr/bin/env tsx
/**
 * PR Stuck Monitor — Hermes-Air
 *
 * Watches open PRs and files Linear issues for ones that look stuck:
 *  - labeled `needs-human`
 *  - no CI activity for >6h with red checks
 *  - red CI for >2h
 *  - >24h since last commit, still draft
 *
 * Deterministic by default; only escalates to LLM when an unfamiliar
 * blocker signature appears.
 *
 * Exits 0 always (transient errors must not loop launchd).
 */

import { execFileSync } from 'node:child_process';

import { logJobEvent, withJobLogging } from '../lib/jobs-log';
import { buildFollowUpBody, fileIssue } from '../lib/linear-client';

const JOB = 'pr-stuck-monitor';

interface Pr {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly isDraft: boolean;
  readonly labels: ReadonlyArray<{ readonly name: string }>;
  readonly updatedAt: string;
  readonly statusCheckRollup: ReadonlyArray<{
    readonly state?: string;
    readonly conclusion?: string;
    readonly name?: string;
  }>;
  readonly author: { readonly login?: string };
}

interface Verdict {
  readonly stuck: boolean;
  readonly reasons: ReadonlyArray<string>;
}

function listOpenPRs(): ReadonlyArray<Pr> {
  const json = execFileSync(
    'gh',
    [
      'pr',
      'list',
      '--state',
      'open',
      '--limit',
      '50',
      '--json',
      'number,title,url,isDraft,labels,updatedAt,statusCheckRollup,author',
    ],
    { encoding: 'utf8', timeout: 30_000 }
  );
  return JSON.parse(json) as ReadonlyArray<Pr>;
}

function hoursSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}

function verdictFor(pr: Pr): Verdict {
  const reasons: string[] = [];
  const labelNames = pr.labels.map(l => l.name);

  if (labelNames.includes('needs-human')) {
    reasons.push('labeled needs-human');
  }

  const failed = pr.statusCheckRollup.filter(
    c => c.conclusion === 'FAILURE' || c.state === 'FAILURE'
  );
  const hoursSinceUpdate = hoursSince(pr.updatedAt);

  if (failed.length > 0 && hoursSinceUpdate > 2) {
    reasons.push(
      `${failed.length} red checks for ${hoursSinceUpdate.toFixed(1)}h`
    );
  }

  if (hoursSinceUpdate > 6 && pr.statusCheckRollup.length > 0) {
    reasons.push(`no activity for ${hoursSinceUpdate.toFixed(1)}h`);
  }

  if (pr.isDraft && hoursSinceUpdate > 24) {
    reasons.push(`draft idle for ${hoursSinceUpdate.toFixed(1)}h`);
  }

  return { stuck: reasons.length > 0, reasons };
}

function buildIssueBody(pr: Pr, reasons: ReadonlyArray<string>): string {
  return buildFollowUpBody({
    source: `pr-stuck-monitor`,
    sourceUrl: pr.url,
    followUp: `PR #${pr.number} ("${pr.title}") looks stuck. Reasons: ${reasons.join('; ')}. Investigate and either unblock the existing branch or close the PR with a written reason.`,
    whyItMatters:
      'Stuck PRs block downstream work and confuse merge-queue prioritization. Hermes-air surfaces them so a coder agent can pick them up.',
    classification: 'Required',
    acceptanceCriteria:
      'PR is either merged, marked needs-human with a fresh review comment, or closed. Linear issue links to the resolution.',
  });
}

async function processPr(pr: Pr): Promise<void> {
  const verdict = verdictFor(pr);
  if (!verdict.stuck) return;

  // Idempotency: a label on the PR prevents re-filing.
  if (pr.labels.some(l => l.name === 'hermes-air-flagged')) {
    logJobEvent({
      job: JOB,
      event: 'already_flagged',
      pr: pr.number,
    });
    return;
  }

  const filed = await fileIssue({
    title: `Stuck PR: #${pr.number} ${pr.title.slice(0, 60)}`,
    description: buildIssueBody(pr, verdict.reasons),
    source: `pr-stuck-monitor:${pr.number}`,
  });

  if (filed.success) {
    // Label the PR so we don't refile next run.
    try {
      execFileSync(
        'gh',
        ['pr', 'edit', String(pr.number), '--add-label', 'hermes-air-flagged'],
        { encoding: 'utf8', timeout: 15_000 }
      );
    } catch {
      // Label might not exist yet; non-fatal.
    }
    logJobEvent({
      job: JOB,
      event: 'issue_filed',
      pr: pr.number,
      identifier: filed.identifier,
      reasons: verdict.reasons,
    });
  } else {
    logJobEvent({
      job: JOB,
      event: 'file_failed',
      pr: pr.number,
      queued: filed.queued,
      error: filed.error,
    });
  }
}

async function main(): Promise<void> {
  await withJobLogging(JOB, async () => {
    const prs = listOpenPRs();
    logJobEvent({ job: JOB, event: 'scanned', count: prs.length });
    for (const pr of prs) {
      try {
        await processPr(pr);
      } catch (err) {
        logJobEvent({
          job: JOB,
          event: 'process_failed',
          pr: pr.number,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  });
}

void main().catch(err => {
  console.error(`[${JOB}] fatal:`, err);
  process.exit(0); // never loop launchd on transient errors
});
