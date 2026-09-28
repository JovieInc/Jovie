/**
 * Which hop of a founder Summer turn failed, and how Retry may resend it.
 * Shared by the /api/chat Summer stream, the history projection and the chat
 * client, so a failed turn always names the hop and offers a safe Retry.
 */

export const SUMMER_FAILURE_HOPS = [
  'summer_unreachable',
  'summer_deployment_unverified',
  'summer_admission_rejected',
  'summer_busy',
  'summer_result_pending',
  'summer_result_unreadable',
  'summer_result_unverified',
  'summer_turn_failed',
  'summer_budget_exhausted',
] as const;

export type SummerFailureHop = (typeof SUMMER_FAILURE_HOPS)[number];

/**
 * - `same-turn`: nothing was recorded for this turn, so Retry resends the same
 *   client turn id. Summer replays the same event idempotently and returns its
 *   answer if the original run finished; it never starts a second run.
 * - `new-turn`: the failure is recorded, so Retry sends a new turn.
 * - `none`: retrying cannot help (daily allowance).
 */
export type SummerRetryMode = 'same-turn' | 'new-turn' | 'none';

export type SummerFailure = {
  readonly hop: SummerFailureHop;
  readonly retry: SummerRetryMode;
};

const HOP_COPY: Record<SummerFailureHop, string> = {
  summer_unreachable: 'Summer didn’t answer. Jovie couldn’t reach Summer.',
  summer_deployment_unverified:
    'Summer didn’t answer. Jovie couldn’t verify which Summer deployment is live.',
  summer_admission_rejected:
    'Summer didn’t answer. Summer rejected the message before starting.',
  summer_busy: 'Summer didn’t answer. It’s still finishing an earlier message.',
  summer_result_pending:
    'Summer is still working on this. Retry checks for the answer without sending it again.',
  summer_result_unreadable:
    'Summer didn’t answer. Its result couldn’t be read.',
  summer_result_unverified:
    'Summer didn’t answer. Its result didn’t match this message.',
  summer_turn_failed: 'Summer didn’t answer. Its run failed.',
  summer_budget_exhausted: 'Summer’s daily conversation allowance is used up.',
};

const HOP_LABEL: Record<SummerFailureHop, string> = {
  summer_unreachable: 'Jovie to Summer',
  summer_deployment_unverified: 'Summer deployment check',
  summer_admission_rejected: 'Summer admission',
  summer_busy: 'Summer, finishing an earlier message',
  summer_result_pending: 'Summer result, still running',
  summer_result_unreadable: 'Summer result read',
  summer_result_unverified: 'Summer result check',
  summer_turn_failed: 'Summer run',
  summer_budget_exhausted: 'Summer daily allowance',
};

const RETRY_EXPLANATION: Record<SummerRetryMode, string> = {
  'same-turn': 'Retry checks for Summer’s answer. It won’t start a second run.',
  'new-turn': 'Retry sends your message again.',
  none: 'Retrying won’t help until the allowance resets.',
};

export function summerHopLabel(hop: SummerFailureHop): string {
  return HOP_LABEL[hop];
}

export function summerRetryExplanation(retry: SummerRetryMode): string {
  return RETRY_EXPLANATION[retry];
}

export function isSummerFailureHop(value: unknown): value is SummerFailureHop {
  return (
    typeof value === 'string' &&
    (SUMMER_FAILURE_HOPS as readonly string[]).includes(value)
  );
}

export function summerFailureText(hop: SummerFailureHop): string {
  return HOP_COPY[hop];
}

/** Recorded terminal states replay on the same client turn id. */
export function summerRetryMode(
  hop: SummerFailureHop,
  terminalState: string | undefined
): SummerRetryMode {
  if (hop === 'summer_budget_exhausted') return 'none';
  return terminalState === 'failure' || terminalState === 'failed_tool'
    ? 'new-turn'
    : 'same-turn';
}

export function parseSummerFailure(value: unknown): SummerFailure | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (!isSummerFailureHop(record.hop)) return null;
  const retry = record.retry;
  if (retry !== 'same-turn' && retry !== 'new-turn' && retry !== 'none')
    return null;
  return { hop: record.hop, retry };
}
