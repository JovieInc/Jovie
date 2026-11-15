import { appendFileSync } from 'node:fs';

// Run 43621008907: the drafting agent's Claude Code weekly limit ran out
// mid-run, and the last frames each burned a retry on the same refusal before
// failing with the same generic npx error. A quota refusal is the account's,
// not the frame's, so the frame is deferred — visibly, with the reset the
// agent itself reports — instead of failed and retried.
const RATE_LIMIT_LINE = /\b(?:rate_limit|weekly limit|usage limit)\b/i;
const RATE_LIMIT_RESET = /resets ([^\n\r]+)/i;

/**
 * Why a failed drafting call defers the frame instead of failing it: the
 * agent is out of its model quota until the provider resets it, so every
 * frame after it fails the same way. Null when the failure is the frame's own.
 */
export function deferralReason(output) {
  const text = String(output ?? '');
  if (!RATE_LIMIT_LINE.test(text)) return null;
  return {
    reason: 'rate_limit',
    reset: RATE_LIMIT_RESET.exec(text)?.[1]?.trim() ?? null,
    detail:
      (text.split(/[\r\n]+/).find(line => RATE_LIMIT_LINE.test(line)) ?? '')
        .trim()
        .slice(0, 200) || null,
  };
}

/**
 * The run page's job summary, when GitHub provides one, so a red deferred
 * job says why it is red and when the refusal lifts.
 */
export function writeDeferredSummary(frame, deferred, env = process.env) {
  if (!env.GITHUB_STEP_SUMMARY) return;
  appendFileSync(
    env.GITHUB_STEP_SUMMARY,
    [
      `### Deferred: ${frame}`,
      '',
      `The drafting agent is out of its model quota (${deferred.reason}), so this frame was not drafted and is not retried this run.`,
      ...(deferred.reset ? [`- Resets: ${deferred.reset}`] : []),
      '- The next pen-draft run after the reset drafts this frame again.',
      '',
    ].join('\n')
  );
}
