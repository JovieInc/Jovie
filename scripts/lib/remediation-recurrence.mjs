// A repair that does not hold is its own signal (Tim 2026-11-22: "nothing
// should be able to fail without a repair or a sucess"). When a red run
// reopens a remediation issue that a green had resolved, the fix did not hold:
// say so on the issue with a running count, so the next agent goes after the
// root cause instead of repeating the last fix. From HUMAN_AFTER recurrences
// on, agent repairs have not held, so the comment says it needs a human look
// and the issue gets the needs-human label, the one page Tim gets. Every other
// failure stays with the agents.
import {
  addLinearIssueComment,
  addLinearIssueLabel,
  listLinearIssueComments,
} from './linear-issue-intake.mjs';

export const RECURRENCE_MARKER = '<!-- remediation-recurred -->';
export const HUMAN_AFTER = 3;
// Same label as NEEDS_HUMAN_LABEL_ID in scripts/lanes/remediation.py.
export const NEEDS_HUMAN_LABEL_ID = 'ccf5eaaa-8705-49f0-b264-ec3558d678b7';

/** @param {{body: string}[]} comments */
export function recurrenceCount(comments) {
  return (comments ?? []).filter(c =>
    String(c?.body ?? '').includes(RECURRENCE_MARKER)
  ).length;
}

/** @param {{count: number, fingerprint: string, runUrl?: string}} input */
export function recurrenceComment({ count, fingerprint, runUrl }) {
  const lines = [
    RECURRENCE_MARKER,
    `\`${fingerprint}\` failed again after it was marked repaired (recurrence ${count}).`,
    'The last fix did not hold. Find the root cause before changing code again.',
  ];
  if (count >= HUMAN_AFTER) {
    lines.push(
      `It has come back ${count} times and agent repairs have not held, so it needs a human look.`
    );
  }
  lines.push('', `Run: ${runUrl || '(run url unavailable)'}`);
  return lines.join('\n');
}

/**
 * @param {any} result the red filing result from applyRemediationDecision
 * @param {{fingerprint: string, runUrl?: string, apiKey?: string, fetchImpl?: typeof fetch}} context
 */
export async function noteRecurrence(result, context) {
  if (!result?.ok || result.reopened !== true || !result.id) {
    return { ok: true, action: 'none' };
  }
  const { fingerprint, runUrl, apiKey, fetchImpl } = context;
  const listed = await listLinearIssueComments({
    issueId: result.id,
    apiKey,
    fetchImpl,
  });
  const count = (listed.ok ? recurrenceCount(listed.comments) : 0) + 1;
  const posted = await addLinearIssueComment({
    issueId: result.id,
    body: recurrenceComment({ count, fingerprint, runUrl }),
    apiKey,
    fetchImpl,
  });
  if (!posted.ok) return { ...posted, action: 'recurrence_unrecorded' };
  const needsHuman = count >= HUMAN_AFTER;
  const paged = needsHuman
    ? (
        await addLinearIssueLabel({
          issueId: result.id,
          labelId: NEEDS_HUMAN_LABEL_ID,
          apiKey,
          fetchImpl,
        })
      ).ok
    : false;
  return { ok: true, action: 'recurred', count, needsHuman, paged };
}
