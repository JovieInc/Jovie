/**
 * Independent verifier contract for the packaged Ovie → Eve → Summer path
 * (JOV-5212). A second verifier can score a redacted proof bundle against
 * this checklist without reading private transcripts.
 */

import {
  isSummerSafeTool,
  SUMMER_MEMORY_NAMESPACE,
} from '@/lib/ovie/isolation';
import { CURRENT_SUMMER_SESSION_ID } from '@/lib/ovie/summer-session';
import { FORBIDDEN_SUMMER_FALLBACKS } from '@/lib/ovie/summer-transport';

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
