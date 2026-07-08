/**
 * Per-conversation model-rotation state for the 👎 recovery loop (JOV-3362 /
 * GitHub #11461).
 *
 * When a user thumbs-down an assistant message, the NEXT message in that
 * conversation is routed to a different model in the fallback chain
 * (trial-and-error self-heal). After {@link AUTO_REVERT_CLEAN_STREAK}
 * consecutive assistant turns without a new 👎, the conversation auto-reverts
 * to the default model.
 *
 * State is module-scoped and keyed by conversation id — the same pattern as
 * `composer-draft-store.ts`. It survives thread switches within a session and
 * never affects other conversations. The client only ever transmits an
 * integer step; the server resolves the actual model id from its own chain
 * (`resolveRotatedChatModel`), so a hostile client cannot select an arbitrary
 * model.
 */

import {
  CHAT_MODEL_ROTATION_CHAIN,
  resolveRotatedChatModel,
} from '@/lib/constants/ai-models';

/** Consecutive clean assistant turns before reverting to the default model. */
export const AUTO_REVERT_CLEAN_STREAK = 3;

const NEW_CHAT_KEY = '__new__';
const ROTATION_CACHE_LIMIT = 50;
const MAX_ROTATION_STEP = CHAT_MODEL_ROTATION_CHAIN.length - 1;

interface RotationState {
  /** Index into the rotation chain. 0 = default model. */
  step: number;
  /** Assistant turns completed without a 👎 since the last rotation. */
  cleanStreak: number;
}

const rotationByConversationId = new Map<string, RotationState>();
const listeners = new Set<() => void>();

function rotationKey(conversationId: string | null | undefined): string {
  return conversationId ?? NEW_CHAT_KEY;
}

function notifyListeners(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // A broken subscriber must never affect chat state.
    }
  }
}

function pruneRotationCache(): void {
  while (rotationByConversationId.size > ROTATION_CACHE_LIMIT) {
    const oldestKey = rotationByConversationId.keys().next().value;
    if (!oldestKey) break;
    rotationByConversationId.delete(oldestKey);
  }
}

function writeState(key: string, state: RotationState): void {
  if (state.step <= 0) {
    rotationByConversationId.delete(key);
  } else {
    rotationByConversationId.set(key, state);
    pruneRotationCache();
  }
  notifyListeners();
}

/** Current rotation step for a conversation (0 = default model). */
export function readModelRotationStep(
  conversationId: string | null | undefined
): number {
  return rotationByConversationId.get(rotationKey(conversationId))?.step ?? 0;
}

/**
 * Record a 👎 on an assistant message: advance to the next model in the
 * chain (clamped) and reset the clean streak.
 */
export function recordThumbsDownRotation(
  conversationId: string | null | undefined
): void {
  const key = rotationKey(conversationId);
  const current = rotationByConversationId.get(key);
  writeState(key, {
    step: Math.min((current?.step ?? 0) + 1, MAX_ROTATION_STEP),
    cleanStreak: 0,
  });
}

/**
 * Undo of a 👎 (user re-clicked the active vote). Reverts the most recent
 * rotation increment. Best-effort: if messages were sent between the vote and
 * the undo, this simply steps back one link in the chain.
 */
export function undoThumbsDownRotation(
  conversationId: string | null | undefined
): void {
  const key = rotationKey(conversationId);
  const current = rotationByConversationId.get(key);
  if (!current) return;
  writeState(key, {
    step: Math.max(current.step - 1, 0),
    cleanStreak: current.cleanStreak,
  });
}

/**
 * Record a successfully completed assistant turn. After
 * {@link AUTO_REVERT_CLEAN_STREAK} consecutive clean turns while rotated,
 * the conversation reverts to the default model.
 */
export function recordAssistantTurnClean(
  conversationId: string | null | undefined
): void {
  const key = rotationKey(conversationId);
  const current = rotationByConversationId.get(key);
  if (!current || current.step <= 0) return;
  const cleanStreak = current.cleanStreak + 1;
  writeState(
    key,
    cleanStreak >= AUTO_REVERT_CLEAN_STREAK
      ? { step: 0, cleanStreak: 0 }
      : { step: current.step, cleanStreak }
  );
}

/** Subscribe to rotation-state changes (for `useSyncExternalStore`). */
export function subscribeModelRotation(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Human-readable label for a gateway model id (e.g. "Gemini 2.5 Pro"). */
export function friendlyModelLabel(modelId: string): string {
  const name = modelId.split('/')[1] ?? modelId;
  return name
    .replace(/-\d{8}$/, '')
    .split('-')
    .map(part =>
      /^\d/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)
    )
    .join(' ');
}

/**
 * User-facing notice for the active rotation, or null when the conversation
 * is on the default model.
 */
export function modelRotationNoticeForStep(step: number): string | null {
  if (step <= 0) return null;
  const model = resolveRotatedChatModel(step);
  return `Switched to ${friendlyModelLabel(model)} for better quality`;
}

/** Test helper — reset module state between unit tests. */
export function resetModelRotationStoreForTests(): void {
  rotationByConversationId.clear();
  listeners.clear();
}
