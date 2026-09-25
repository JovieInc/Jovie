/**
 * Shared DB access for coding-agent-run ingestion scripts.
 * Uses the raw neon driver (same pattern as scripts/sync-dev-clerk-ids.ts)
 * so these scripts run under plain `tsx` without app boot.
 */

import { neon } from '@neondatabase/serverless';

export function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  return neon(url.replace(/^postgres(ql)?\+neon:\/\//, 'postgres$1://'));
}

export interface CodingAgentRunUpsert {
  source: string;
  sourceRunId: string;
  sessionUrl: string | null;
  agentId: string | null;
  agentName: string | null;
  modelName: string | null;
  costUsd: number | null;
  costSource: 'actual' | 'estimated';
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  toolsUsed: Record<string, number>;
  promptDigest: string | null;
  prUrl: string | null;
  linearIssueId: string | null;
  notes: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

/**
 * Idempotent upsert keyed on (source, source_run_id). Never touches
 * outcome_label/diff_stats/ci_result — the labeler owns those columns.
 */
export async function upsertCodingAgentRun(
  sql: ReturnType<typeof getSql>,
  row: CodingAgentRunUpsert
): Promise<'inserted' | 'updated'> {
  const res = await sql`
    INSERT INTO coding_agent_runs (
      source, source_run_id, session_url, agent_id, agent_name,
      model_name, cost_usd, cost_source,
      input_tokens, output_tokens, cached_tokens,
      tools_used, prompt_digest, pr_url, linear_issue_id, notes,
      started_at, completed_at
    ) VALUES (
      ${row.source}, ${row.sourceRunId}, ${row.sessionUrl}, ${row.agentId},
      ${row.agentName}, ${row.modelName}, ${row.costUsd}, ${row.costSource},
      ${row.inputTokens}, ${row.outputTokens}, ${row.cachedTokens},
      ${JSON.stringify(row.toolsUsed)}::jsonb, ${row.promptDigest},
      ${row.prUrl}, ${row.linearIssueId}, ${row.notes},
      ${row.startedAt}, ${row.completedAt}
    )
    ON CONFLICT (source, source_run_id) DO UPDATE SET
      session_url = EXCLUDED.session_url,
      agent_id = EXCLUDED.agent_id,
      agent_name = EXCLUDED.agent_name,
      model_name = COALESCE(EXCLUDED.model_name, coding_agent_runs.model_name),
      cost_usd = COALESCE(EXCLUDED.cost_usd, coding_agent_runs.cost_usd),
      cost_source = CASE
        WHEN coding_agent_runs.cost_source = 'actual' THEN 'actual'
        ELSE EXCLUDED.cost_source
      END,
      input_tokens = COALESCE(EXCLUDED.input_tokens, coding_agent_runs.input_tokens),
      output_tokens = COALESCE(EXCLUDED.output_tokens, coding_agent_runs.output_tokens),
      cached_tokens = COALESCE(EXCLUDED.cached_tokens, coding_agent_runs.cached_tokens),
      tools_used = EXCLUDED.tools_used,
      prompt_digest = COALESCE(EXCLUDED.prompt_digest, coding_agent_runs.prompt_digest),
      pr_url = COALESCE(EXCLUDED.pr_url, coding_agent_runs.pr_url),
      linear_issue_id = COALESCE(EXCLUDED.linear_issue_id, coding_agent_runs.linear_issue_id),
      notes = EXCLUDED.notes,
      started_at = COALESCE(EXCLUDED.started_at, coding_agent_runs.started_at),
      completed_at = COALESCE(EXCLUDED.completed_at, coding_agent_runs.completed_at),
      updated_at = NOW()
    RETURNING (xmax = 0) AS inserted
  `;
  return res[0]?.inserted ? 'inserted' : 'updated';
}

export interface LabelCandidateRow {
  id: string;
  source: string;
  pr_url: string | null;
  pr_number: number | null;
  outcome_label: string;
  merge_timestamp: string | null;
  completed_at: string | null;
  diff_stats: { files?: string[] } | null;
}

/** Rows needing (re)labeling: open, or terminal labels still inside the window. */
export async function fetchLabelCandidates(
  sql: ReturnType<typeof getSql>
): Promise<LabelCandidateRow[]> {
  return sql`
    SELECT id, source, pr_url, pr_number, outcome_label, merge_timestamp,
           completed_at, diff_stats
    FROM coding_agent_runs
    WHERE (pr_url IS NOT NULL OR pr_number IS NOT NULL)
      AND (
        outcome_label = 'open'
        OR merge_timestamp >= NOW() - INTERVAL '8 days'
      )
    ORDER BY completed_at ASC NULLS LAST, ingested_at
    LIMIT 500
  ` as Promise<LabelCandidateRow[]>;
}

export async function applyOutcomeLabel(
  sql: ReturnType<typeof getSql>,
  id: string,
  patch: {
    outcomeLabel: string;
    mergeTimestamp: string | null;
    revertLink: string | null;
    postLandIncidents: string[];
    diffStats: unknown;
    ciResult: unknown;
    prNumber: number | null;
  }
): Promise<void> {
  await sql`
    UPDATE coding_agent_runs SET
      outcome_label = ${patch.outcomeLabel},
      merge_timestamp = COALESCE(${patch.mergeTimestamp}, merge_timestamp),
      revert_link = COALESCE(${patch.revertLink}, revert_link),
      post_land_incidents = ${patch.postLandIncidents},
      diff_stats = COALESCE(${patch.diffStats ? JSON.stringify(patch.diffStats) : null}::jsonb, diff_stats),
      ci_result = COALESCE(${patch.ciResult ? JSON.stringify(patch.ciResult) : null}::jsonb, ci_result),
      pr_number = COALESCE(${patch.prNumber}, pr_number),
      updated_at = NOW()
    WHERE id = ${id}
  `;
}
