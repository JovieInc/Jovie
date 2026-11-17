'use client';

import { APP_ROUTES } from '@/constants/routes';
import {
  getCacheGeneration,
  getCacheScope,
} from '@/lib/queries/cache-isolation';

export const PENDING_CHAT_PROMPT_KEY = 'jovie.pendingChatPrompt';

interface AppRouter {
  push(path: string): void;
}

export function openChatWithPrompt(prompt: string, router: AppRouter): void {
  pendingChatDraft = null;
  if (globalThis.window !== undefined) {
    try {
      globalThis.window.sessionStorage.setItem(PENDING_CHAT_PROMPT_KEY, prompt);
    } catch {
      // Best-effort prompt handoff. Navigation should still proceed.
    }
  }

  router.push(APP_ROUTES.CHAT);
}

export function consumePendingChatPrompt(): string | null {
  if (globalThis.window === undefined) return null;

  try {
    const prompt = globalThis.window.sessionStorage.getItem(
      PENDING_CHAT_PROMPT_KEY
    );
    if (!prompt) return null;

    globalThis.window.sessionStorage.removeItem(PENDING_CHAT_PROMPT_KEY);
    return prompt;
  } catch {
    return null;
  }
}

interface PendingChatDraft {
  readonly text: string;
  readonly scope: string;
}

// Memory-only: a reload must not revive private context from another session.
let pendingChatDraft: PendingChatDraft | null = null;

function currentDraftScope(): string | null {
  const scope = getCacheScope();
  if (!scope.ready || !scope.userId || !scope.sessionId || !scope.profileId) {
    return null;
  }
  return JSON.stringify([getCacheGeneration(), scope]);
}

/** Open a new chat with editable context, never an automatically sent prompt. */
export function openChatWithDraft(text: string, router: AppRouter): boolean {
  const scope = currentDraftScope();
  if (!scope || !text.trim()) return false;
  pendingChatDraft = { text, scope };
  // A draft request supersedes an earlier, unconsumed auto-send handoff.
  consumePendingChatPrompt();
  router.push(APP_ROUTES.CHAT);
  return true;
}

/** Consume only in the matching creator's new-chat composer. */
export function consumePendingChatDraft(
  profileId: string | undefined
): string | null {
  const pending = pendingChatDraft;
  pendingChatDraft = null;
  if (
    !pending ||
    pending.scope !== currentDraftScope() ||
    profileId !== getCacheScope().profileId
  ) {
    return null;
  }
  return pending.text;
}
