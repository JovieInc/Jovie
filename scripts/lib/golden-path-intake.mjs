import { upsertLinearIssueByTitleFingerprint } from './linear-issue-intake.mjs';

/**
 * JOV-5962 / JOV-5966: golden-path prod breaks file ONE canonical Linear
 * record per fingerprint, created directly in Todo so the P0 skips Triage
 * (decisions/tune-p0-cursor-direct-2026-08-13: P0 golden-path FAIL goes
 * Cursor-direct, never sits in Triage). Deduped before create via the
 * shared title-fingerprint intake — no clone fan-out.
 */
export async function createGoldenPathLinearIssue(
  {
    fingerprint,
    prompt,
    apiKey = process.env.LINEAR_API_KEY,
    stateName = 'Todo',
  },
  fetchImpl = fetch
) {
  const title = `P0: golden path broken in prod (${fingerprint})`;
  const description = `${prompt}\n\nGem missed this after the JOV-5085 lock was on.`;
  return upsertLinearIssueByTitleFingerprint({
    fingerprint,
    title,
    description,
    priority: 1,
    stateName,
    apiKey,
    fetchImpl,
  });
}
