import {
  type ComposerRecoveryContext,
  readSummerTurnRecovery,
} from '@/lib/chat/composer-draft-store';
import { summerRetryExplanation } from '@/lib/ovie/summer-failure';
import { FetchError } from '@/lib/queries/fetch';
import type { ChatError } from '../types';

/** Fast interval (ms) to poll for auto-generated title after first message. */
const TITLE_POLL_FAST_INTERVAL_MS = 2_000;

/** Slower interval (ms) used once title polling appears stalled. */
const TITLE_POLL_BACKOFF_INTERVAL_MS = 5_000;

/** Max duration (ms) to keep polling before giving up. */
export const TITLE_POLL_MAX_DURATION_MS = 15_000;

/** Number of fast poll intervals to allow before backing off. */
const TITLE_POLL_FAST_WINDOW_MS = TITLE_POLL_FAST_INTERVAL_MS * 3;
interface ChatTurnMetadata {
  readonly conversationId?: string;
  readonly turnId?: string;
  readonly requestId?: string;
  readonly toolStepCapExhausted?: boolean;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isRecoverableSummerHistoryFailure(error: unknown): boolean {
  return (
    error instanceof FetchError && (error.status === 404 || error.isRetryable())
  );
}

export function extractChatTurnMetadata(
  value: unknown
): ChatTurnMetadata | null {
  if (!isRecord(value)) return null;
  const conversationId =
    typeof value.conversationId === 'string' ? value.conversationId : undefined;
  const turnId = typeof value.turnId === 'string' ? value.turnId : undefined;
  const requestId =
    typeof value.requestId === 'string' ? value.requestId : undefined;
  const toolStepCapExhausted =
    value.toolStepCapExhausted === true ? true : undefined;

  if (!conversationId && !turnId && !requestId && !toolStepCapExhausted) {
    return null;
  }
  return { conversationId, turnId, requestId, toolStepCapExhausted };
}

export function inferToolIntentFromPrompt(text: string): string | null {
  const normalized = text.trim().toLowerCase();
  const mentionsAlbumArt =
    /\balbum\s+art\b/.test(normalized) ||
    /\bcover\s+art\b/.test(normalized) ||
    /\bartwork\b/.test(normalized);
  const asksForGeneration = /\b(generate|create|make|design|produce)\b/.test(
    normalized
  );
  const asksForBrief =
    /\bbrief\b/.test(normalized) || /\bdraft\b/.test(normalized);

  if (mentionsAlbumArt && asksForGeneration && !asksForBrief) {
    return 'album_art_generation';
  }

  const mentionsImage =
    /\b(photo|image|picture|shot|pic|selfie|portrait|press)\b/.test(normalized);
  const asksForRetouch =
    /\b(retouch|touch[\s-]?up|enhance|polish|clean\s+up)\b/.test(normalized);

  if (mentionsImage && asksForRetouch) {
    return 'image_retouch';
  }

  return null;
}

export function inferToolIntentFromSkill(id: string): string | null {
  return id === 'generateAlbumArt' ? 'album_art_generation' : id;
}

export function getTitlePollIntervalMs(
  titlePollingSince: number | null,
  currentTime: number
): number | false {
  if (titlePollingSince === null) {
    return false;
  }

  const elapsed = currentTime - titlePollingSince;

  if (elapsed >= TITLE_POLL_MAX_DURATION_MS) {
    return false;
  }

  return elapsed < TITLE_POLL_FAST_WINDOW_MS
    ? TITLE_POLL_FAST_INTERVAL_MS
    : TITLE_POLL_BACKOFF_INTERVAL_MS;
}

export function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error('Chat send failed');
}

export function readRecoveryError(
  context: ComposerRecoveryContext
): ChatError | null {
  const recovery = readSummerTurnRecovery(context);
  if (!recovery) return null;
  return {
    type: 'server',
    message: summerRetryExplanation(recovery.retry),
    errorCode: recovery.errorCode,
    ...recovery.error,
    requestId: recovery.requestId,
    failedMessage: recovery.retry === 'none' ? undefined : recovery.message,
    ...(recovery.retry === 'same-turn'
      ? { retryClientTurnId: recovery.clientTurnId }
      : {}),
  };
}
