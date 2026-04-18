'use client';

import { APP_ROUTES } from '@/constants/routes';

export const PENDING_CHAT_PROMPT_KEY = 'jovie.pendingChatPrompt';

interface AppRouter {
  push(path: string): void;
}

export function openChatWithPrompt(prompt: string, router: AppRouter): void {
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
