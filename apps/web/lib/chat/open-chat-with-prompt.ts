'use client';

import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { APP_ROUTES } from '@/constants/routes';

export const PENDING_CHAT_PROMPT_KEY = 'jovie.pendingChatPrompt';

export function openChatWithPrompt(
  prompt: string,
  router: Pick<AppRouterInstance, 'push'>
): void {
  if (typeof window !== 'undefined') {
    window.sessionStorage.setItem(PENDING_CHAT_PROMPT_KEY, prompt);
  }

  router.push(APP_ROUTES.CHAT);
}

export function consumePendingChatPrompt(): string | null {
  if (typeof window === 'undefined') return null;

  const prompt = window.sessionStorage.getItem(PENDING_CHAT_PROMPT_KEY);
  if (!prompt) return null;

  window.sessionStorage.removeItem(PENDING_CHAT_PROMPT_KEY);
  return prompt;
}
