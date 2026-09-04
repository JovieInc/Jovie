/**
 * Independent verifier contract for the packaged Ovie → Eve → Summer path
 * (JOV-5212). A second verifier can score a redacted proof bundle against
 * this checklist without reading private transcripts.
 *
 * JOV-INV-012: this door is a founder-operator control plane, not a
 * user-facing product variant. The exception below is the contract; do not
 * add a parallel analytics stack or auto-promote conversation personas.
 */

import {
  isSummerSafeTool,
  SUMMER_MEMORY_NAMESPACE,
} from '@/lib/ovie/isolation';
import { CURRENT_SUMMER_SESSION_ID } from '@/lib/ovie/summer-session';
import { FORBIDDEN_SUMMER_FALLBACKS } from '@/lib/ovie/summer-transport';

/**
 * Justified non-product exception (JOV-INV-012). Tim -> Ovie presentation ->
 * Eve durable ingress -> current Summer is operator-only. Artist/customer
 * Jovie is isolated and must not read this session or its tools.
 */
export const OVIE_SUMMER_DOOR_OPTIMIZATION_EXCEPTION = {
  kind: 'non-product',
  invariant: 'JOV-INV-012',
  justification:
    'Operator-only Mac Ovie door. Not a customer-facing page, link, asset, campaign, recommendation, or content variant. Auto-promoting speaker, memory namespace, or tool allowlist would break identity isolation.',
  variantIdentity: 'mac-ovie-door:summer-current:operator-v1',
  exposure:
    'Not a product exposure. Packaged Mac Ovie door for the founder operator only; no analytics, model-experiment, audience-event, YouTube, or release-to-revenue event is emitted.',
  outcome:
    'Operator conversation correctness: Eve receipt bound, current Summer session continuity, explicit unavailable, no Jovie/Eve/Ovie fallback.',
  attribution:
    'None on product surfaces. Redacted proof bundles use eveWorkId, correlation/work/session ids, and tool receipt ids only.',
  eligibleContextDimensions: [] as const,
  hypothesis:
    'Not an experiment. The authoritative current Summer must remain the only speaker on this door.',
  primaryMetric:
    'Independent verifier acceptance (evaluateOvieConversationAcceptance ok=true), not a product conversion metric.',
  guardrails: [
    'No fallback to customer Jovie, Eve-as-speaker, Ovie-as-persona, Zoe, OpenClaw, a mock, or a fresh empty persona.',
    'Tim-as-operator context cannot be read from customer Jovie.',
    'Customer Jovie cannot access Summer/company tools.',
    'Unsigned or replayed Summer input is rejected.',
  ],
  privacyAndConsent:
    'Operator conversation. Do not retain private screenshots or transcripts outside the redacted proof bundle. No fan-level identifiers.',
  optimizerOwner: 'Ovie operator door (JOV-5212)',
  cadence:
    'No auto-optimization. Re-evaluate only when the signed Summer shadow route or packaged Mac door contract changes.',
  decisionWriteback:
    'None on optimization_experiments. Acceptance is the independent verifier verdict plus Linear JOV-5212 runtime proof.',
  rollbackOrControl:
    'Disable Summer transport and present explicit unavailable/unknown while retaining durable receipts and history.',
} as const;

export const OVIE_CONVERSATION_ACCEPTANCE_CHECKS = [
  'eve-work-bound',
  'current-summer-session',
  'five-turn-continuity',
  'summer-memory-namespace',
  'safe-tool-receipt',
  'no-forbidden-fallback',
  'relaunch-no-loss-or-fork',
  'cancel-reconnect-recovery',
  'unavailable-explicit',
  'operator-customer-isolation',
] as const;

export type OvieConversationAcceptanceCheck =
  (typeof OVIE_CONVERSATION_ACCEPTANCE_CHECKS)[number];

export type OvieConversationAcceptanceProof = {
  readonly eveWorkId: string | null;
  readonly summerSessionId: string;
  readonly memoryNamespace: string;
  readonly speaker: string;
  readonly turnCount: number;
  readonly turnTexts: readonly string[];
  readonly toolReceipt: {
    readonly ok: boolean;
    readonly tool: string;
    readonly receiptId: string;
  } | null;
  readonly relaunchSessionId: string;
  readonly relaunchTurnCount: number;
  readonly canceledPersisted: boolean;
  readonly reconnectRecoveredText: string | null;
  readonly unavailableText: string;
  readonly operatorVisibleToCustomer: boolean;
  readonly customerCanUseSummerTools: boolean;
  readonly fallbackUsed: string | null;
};

export function evaluateOvieConversationAcceptance(
  proof: OvieConversationAcceptanceProof
): {
  readonly ok: boolean;
  readonly failed: readonly OvieConversationAcceptanceCheck[];
} {
  const failed: OvieConversationAcceptanceCheck[] = [];
  if (!proof.eveWorkId) failed.push('eve-work-bound');
  if (proof.summerSessionId !== CURRENT_SUMMER_SESSION_ID) {
    failed.push('current-summer-session');
  }
  if (proof.turnCount < 5 || proof.turnTexts.length < 5) {
    failed.push('five-turn-continuity');
  }
  if (proof.memoryNamespace !== SUMMER_MEMORY_NAMESPACE) {
    failed.push('summer-memory-namespace');
  }
  if (
    !proof.toolReceipt?.ok ||
    !proof.toolReceipt.receiptId ||
    !isSummerSafeTool(proof.toolReceipt.tool)
  ) {
    failed.push('safe-tool-receipt');
  }
  const fallback = proof.fallbackUsed?.trim().toLowerCase() ?? '';
  if (
    proof.speaker !== 'summer' ||
    (fallback &&
      FORBIDDEN_SUMMER_FALLBACKS.some(
        label => fallback === label || fallback.includes(label)
      ))
  ) {
    failed.push('no-forbidden-fallback');
  }
  if (
    proof.relaunchSessionId !== proof.summerSessionId ||
    proof.relaunchTurnCount !== proof.turnCount
  ) {
    failed.push('relaunch-no-loss-or-fork');
  }
  if (proof.canceledPersisted || !proof.reconnectRecoveredText) {
    failed.push('cancel-reconnect-recovery');
  }
  if (!/unavailable|unknown|disconnected/i.test(proof.unavailableText)) {
    failed.push('unavailable-explicit');
  }
  if (proof.operatorVisibleToCustomer || proof.customerCanUseSummerTools) {
    failed.push('operator-customer-isolation');
  }
  return { ok: failed.length === 0, failed };
}
