import type { ChatError } from '@/components/jovie/types';
import type {
  SummerFailureHop,
  SummerRetryMode,
} from '@/lib/ovie/summer-failure';
import {
  getCacheGeneration,
  getCacheScope,
} from '@/lib/queries/cache-isolation';

const NEW_CHAT_DRAFT_KEY = '__new__';
const DRAFT_CACHE_LIMIT = 50;

const draftByConversationId = new Map<string, string>();
const summerRecoveryByContext = new Map<string, SummerTurnRecovery>();

export interface ComposerRecoveryContext {
  readonly chatMode?: 'ov';
  readonly conversationId: string | null;
  readonly profileId?: string;
}

export interface SummerTurnRecovery {
  readonly clientTurnId: string;
  readonly message: string;
  readonly retry: SummerRetryMode;
  readonly errorCode?: SummerFailureHop;
  readonly requestId?: string;
  /** Already-sanitized UI guidance; never retain the transport Error or cause. */
  readonly error?: Pick<
    ChatError,
    'type' | 'message' | 'retryAfter' | 'errorCode' | 'suppressComposerPause'
  >;
}

function recoveryKey(context: ComposerRecoveryContext): string | null {
  if (context.chatMode !== 'ov') return null;
  const scope = getCacheScope();
  if (!scope.ready || !scope.userId || !scope.sessionId) return null;
  return JSON.stringify([
    getCacheGeneration(),
    scope.userId,
    scope.sessionId,
    scope.profileId,
    scope.impersonationSubject,
    context.chatMode,
    context.conversationId,
    context.profileId ?? null,
  ]);
}

/** Memory-only recovery within the current account/session and Summer door. */
export function readSummerTurnRecovery(
  context: ComposerRecoveryContext
): SummerTurnRecovery | null {
  const key = recoveryKey(context);
  return key === null ? null : (summerRecoveryByContext.get(key) ?? null);
}

export function saveSummerTurnRecovery(
  context: ComposerRecoveryContext,
  recovery: SummerTurnRecovery
): void {
  const key = recoveryKey(context);
  if (key === null) return;
  summerRecoveryByContext.delete(key);
  summerRecoveryByContext.set(key, recovery);
  while (summerRecoveryByContext.size > DRAFT_CACHE_LIMIT) {
    const oldestKey = summerRecoveryByContext.keys().next().value;
    if (!oldestKey) break;
    summerRecoveryByContext.delete(oldestKey);
  }
}

export function clearSummerTurnRecovery(
  context: ComposerRecoveryContext,
  clientTurnId?: string
): void {
  const key = recoveryKey(context);
  if (
    key !== null &&
    (!clientTurnId ||
      summerRecoveryByContext.get(key)?.clientTurnId === clientTurnId)
  ) {
    summerRecoveryByContext.delete(key);
  }
}

function draftKey(conversationId: string | null | undefined): string {
  return conversationId ?? NEW_CHAT_DRAFT_KEY;
}

function trimDraft(value: string): string {
  return value;
}

function pruneDraftCache(): void {
  while (draftByConversationId.size > DRAFT_CACHE_LIMIT) {
    const oldestKey = draftByConversationId.keys().next().value;
    if (!oldestKey) break;
    draftByConversationId.delete(oldestKey);
  }
}

/** Persist the in-progress composer text for a conversation thread. */
export function saveComposerDraft(
  conversationId: string | null | undefined,
  value: string
): void {
  const key = draftKey(conversationId);
  const nextValue = trimDraft(value);
  if (nextValue.length === 0) {
    draftByConversationId.delete(key);
    return;
  }
  draftByConversationId.set(key, nextValue);
  pruneDraftCache();
}

/** Read the saved composer draft for a conversation thread. */
export function readComposerDraft(
  conversationId: string | null | undefined
): string {
  return draftByConversationId.get(draftKey(conversationId)) ?? '';
}

/** Remove a saved composer draft after a successful send or command commit. */
export function clearComposerDraft(
  conversationId: string | null | undefined
): void {
  draftByConversationId.delete(draftKey(conversationId));
}

/** Test helper — reset module state between unit tests. */
export function resetComposerDraftStoreForTests(): void {
  draftByConversationId.clear();
  summerRecoveryByContext.clear();
}
