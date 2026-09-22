#!/usr/bin/env tsx
/**
 * Outcome labeler for coding_agent_runs (JOV-6508).
 *
 * Second lightweight pass over the 7-day window (daily cadence):
 *   merged → landed (after window) | reverted | failed (Sentry incident on
 *   diff files) ; closed-unmerged → abandoned ; otherwise stays open.
 * Also fills diff_stats (PR files) and ci_result (check runs on head sha).
 *
 * Usage: doppler run -p jovie-web -c dev -- pnpm tsx scripts/agents/label-outcomes.ts
 */

import {
  decideOutcome,
  isRevertOfPr,
  matchIncidentFiles,
  normalizeRepoPath,
  parseGithubPrUrl,
  revertTargetPrNumber,
} from '../../apps/web/lib/coding-agent-runs/outcomes';
import {
  applyOutcomeLabel,
  fetchLabelCandidates,
  getSql,
} from './lib/coding-agent-runs-db';
import {
  getCheckRuns,
  getPr,
  getPrFiles,
  githubRepo,
  listRecentlyMergedPrs,
} from './lib/github-api';
import { loadHermesEnv } from './lib/hermes-env';
import {
  issueStackFilenames,
  listIssuesSince,
  sentryConfigured,
} from './lib/sentry-api';

const JOB = 'coding-agent-label';
const MAX_ROWS = 100;

async function main(): Promise<void> {
  loadHermesEnv();
  const sql = getSql();
  const { owner, repo } = githubRepo();
  const rows = (await fetchLabelCandidates(sql)).slice(0, MAX_ROWS);
  const nowMs = Date.now();
  const counts: Record<string, number> = {};
  const patches: {
    id: string;
    patch: Parameters<typeof applyOutcomeLabel>[2];
  }[] = [];

  for (const row of rows) {
    const parsed =
      parseGithubPrUrl(row.pr_url) ??
      (row.pr_number ? { owner, repo, number: row.pr_number } : null);

    let prMerged = false;
    let mergeTimestampMs: number | null = null;
    let mergeIso: string | null = null;
    let revertLink: string | null = null;
    const incidentIds: string[] = [];
    let diffStats: unknown = null;
    let ciResult: unknown = null;
    let prState: 'open' | 'closed' | null = null;
    let prNumber = parsed?.number ?? null;

    if (parsed) {
      const pr = await getPr(parsed.owner, parsed.repo, parsed.number).catch(
        err => {
          console.warn(
            `[${JOB}] getPr ${parsed.owner}/${parsed.repo}#${parsed.number}:`,
            err instanceof Error ? err.message : err
          );
          return null;
        }
      );
      if (pr) {
        prState = pr.state;
        prMerged = Boolean(pr.merged_at);
        mergeTimestampMs = pr.merged_at
          ? new Date(pr.merged_at).getTime()
          : null;
        mergeIso = pr.merged_at;
        prNumber = pr.number;

        const files = await getPrFiles(
          parsed.owner,
          parsed.repo,
          pr.number
        ).catch(() => []);
        const filePaths = files.map(f => normalizeRepoPath(f.filename));
        diffStats = {
          files: filePaths,
          fileCount: files.length,
          additions: files.reduce((s, f) => s + f.additions, 0),
          deletions: files.reduce((s, f) => s + f.deletions, 0),
        };

        const checks = await getCheckRuns(
          parsed.owner,
          parsed.repo,
          pr.head.sha
        ).catch(() => []);
        ciResult = checks.map(c => ({
          name: c.name,
          status: c.status,
          conclusion: c.conclusion,
          runId: c.id,
        }));

        if (prMerged && mergeIso) {
          // Revert join: recently merged PRs that look like reverts of this one.
          const candidates = await listRecentlyMergedPrs(
            parsed.owner,
            parsed.repo,
            mergeIso
          ).catch(() => []);
          for (const c of candidates) {
            if (c.number === pr.number) continue;
            if (
              isRevertOfPr({
                title: c.title,
                body: c.body,
                headRefName: c.head?.ref,
              }) &&
              revertTargetPrNumber({ title: c.title, body: c.body }) ===
                pr.number
            ) {
              revertLink = c.html_url;
              break;
            }
          }

          // Sentry incident join within the post-merge window.
          if (sentryConfigured()) {
            const issues = await listIssuesSince(mergeIso).catch(() => []);
            for (const issue of issues) {
              const frames = await issueStackFilenames(issue.id).catch(
                () => []
              );
              if (matchIncidentFiles(frames, filePaths).length > 0) {
                incidentIds.push(issue.id);
              }
            }
          }
        }
      }
    }

    const outcome = decideOutcome({
      hasPr: Boolean(parsed),
      prState,
      prMerged,
      mergeTimestampMs,
      revertDetected: Boolean(revertLink),
      incidentIds,
      nowMs,
    });

    // Collect, don't write — the neon connection idles during the long
    // GitHub/Sentry fetch loop and drops. Writes happen in a short batch
    // at the end instead.
    patches.push({
      id: row.id,
      patch: {
        outcomeLabel: outcome,
        mergeTimestamp: mergeIso,
        revertLink,
        postLandIncidents: incidentIds,
        diffStats,
        ciResult,
        prNumber,
      },
    });
    counts[outcome] = (counts[outcome] ?? 0) + 1;
  }

  let labeled = 0;
  for (const { id, patch } of patches) {
    await applyOutcomeLabel(sql, id, patch);
    labeled++;
  }

  console.log(`[${JOB}] labeled ${labeled} rows:`, counts);
}

void main().catch(err => {
  console.error(`[${JOB}] fatal:`, err);
  process.exit(1);
});
