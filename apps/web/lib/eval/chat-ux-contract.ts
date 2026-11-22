/**
 * Assistants chat UX contract (ASS-11).
 *
 * Deterministic source of truth for:
 * - which jank unit tests must stay green for the CI ratchet
 * - the Assistants first-token target (<1s)
 *
 * Live TTFT: `./chat-first-token-sample` + `./chat-first-token-live-probe`
 * (ASS-28/ASS-86); unrun skips latency compare.
 */

export const ASSISTANTS_CHAT_UX_CONTRACT_VERSION =
  'jovie.assistants-chat-ux/v1' as const;

/** Project target: first visible assistant token under 1s. */
export const ASSISTANTS_FIRST_TOKEN_TARGET_MS = 1_000 as const;

/** Metric name recorded by `/app/chat` via interaction-latency. */
export const ASSISTANTS_FIRST_TOKEN_METRIC = 'chat_first_token' as const;

/**
 * Unit tests that prove chat continuity stays jank-free. Referenced by the
 * deterministic eval lane so a jank regression fails CI without Playwright.
 */
export const CHAT_JANK_CONTRACT_TESTS = [
  'tests/unit/chat/jank-monitor.test.ts',
  'tests/unit/chat/useChatJankMonitor.test.tsx',
] as const;

export type ChatJankContractTest = (typeof CHAT_JANK_CONTRACT_TESTS)[number];

export type ChatUxGateSample = {
  readonly jankPassed: boolean;
  /**
   * Observed first-token p50 in ms when measured (mocked-stream CI or live).
   * `null` + status `unrun` skips the latency compare.
   */
  readonly firstTokenP50Ms: number | null;
  readonly firstTokenStatus: 'unrun' | 'recorded';
};

export type ChatUxGateResult = {
  readonly ok: boolean;
  readonly reasons: readonly string[];
};

/**
 * Fail-closed gate for assistants ratchet: jank must pass; recorded first-token
 * p50 must stay under the Assistants target. Unrun latency does not soft-pass
 * a jank failure.
 */
export function evaluateChatUxGate(sample: ChatUxGateSample): ChatUxGateResult {
  const reasons: string[] = [];
  if (!sample.jankPassed) {
    reasons.push('chat jank contract failed');
  }
  if (
    sample.firstTokenStatus === 'recorded' &&
    (sample.firstTokenP50Ms === null ||
      !Number.isFinite(sample.firstTokenP50Ms) ||
      sample.firstTokenP50Ms >= ASSISTANTS_FIRST_TOKEN_TARGET_MS)
  ) {
    reasons.push(
      `first-token p50 ${String(sample.firstTokenP50Ms)}ms >= ${ASSISTANTS_FIRST_TOKEN_TARGET_MS}ms target`
    );
  }
  return { ok: reasons.length === 0, reasons };
}
