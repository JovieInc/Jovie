import {
  JOVIE_TEAM_ID,
  upsertLinearIssueByTitleFingerprint,
} from './linear-issue-intake.mjs';

export { JOVIE_TEAM_ID };

/**
 * Fail-closed, deduped Linear intake for golden-path prod breaks (JOV-5966).
 *
 * The title carries the fingerprint so `upsertLinearIssueByTitleFingerprint`
 * finds the existing canonical issue before creating anything — the same
 * pattern as synthetic-monitoring and observability intake. P0 golden-path
 * breaks skip the Triage intake queue entirely: they are created directly in
 * the Todo (agent-ready) state so remediation starts immediately instead of
 * waiting for the backlog-orchestrator reconcile cycle.
 */
export async function createGoldenPathLinearIssue(
  { fingerprint, prompt, apiKey = process.env.LINEAR_API_KEY },
  fetchImplCompat = fetch
) {
  if (!apiKey) {
    return { ok: false, reason: 'missing_linear_api_key' };
  }
  if (typeof fingerprint !== 'string' || fingerprint.trim().length === 0) {
    return { ok: false, reason: 'missing_fingerprint' };
  }
  const title = `P0: golden path broken in prod (${fingerprint})`;
  const description = `${prompt}\n\nGem missed this after the JOV-5085 lock was on.`;
  return upsertLinearIssueByTitleFingerprint({
    fingerprint,
    title,
    description,
    priority: 1,
    createStateName: 'Todo',
    reopenTerminal: true,
    apiKey,
    fetchImpl: fetchImplCompat,
  });
}
