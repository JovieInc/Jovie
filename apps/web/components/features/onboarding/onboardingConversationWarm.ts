'use client';

/**
 * Conversation-chunk warming for /start (JOV-9611 + JOV-12023).
 *
 * The renderers (markdown/streamdown message bodies, tool UI, proposal
 * cards) stay split out of the entry bundle; these loaders resolve to the
 * same chunks as OnboardingChat's inline dynamic() imports. They warm on
 * the visitor's first interaction with the chat — or the first submit,
 * which covers the starter auto-send — never on idle: the idle warm pulled
 * ~550 KiB of conversation chunks into /start's first seconds, inside
 * Lighthouse's measured window, where their parse/eval owned ~170 ms of TBT
 * (merge-group run 42689319887: /start TBT 431 vs a 350 budget, perf 0.89
 * vs 0.92).
 */
export const loadChatMessage = () =>
  import('@/components/jovie/components/ChatMessage').then(
    mod => mod.ChatMessage
  );
export const loadToolPartsRenderer = () =>
  import('@/components/jovie/tool-ui').then(mod => mod.ToolPartsRenderer);
export const loadChatProposeCheckoutCard = () =>
  import('./ChatProposeCheckoutCard').then(mod => mod.ChatProposeCheckoutCard);
export const loadChatProposeNextStepCard = () =>
  import('./ChatProposeNextStepCard').then(mod => mod.ChatProposeNextStepCard);

/** Fire-and-forget warm of every conversation chunk. */
export function preloadOnboardingConversationChunks(): void {
  void Promise.all([
    loadChatMessage(),
    loadToolPartsRenderer(),
    loadChatProposeCheckoutCard(),
    loadChatProposeNextStepCard(),
  ]).catch(() => undefined);
}

const CONVERSATION_WARM_EVENTS = ['pointerdown', 'keydown'] as const;

/**
 * Attach the intent warm to the chat surface: one-shot passive capture
 * listeners, so the first pointer or key event warms the chunks while the
 * visitor is still typing and the first assistant reply renders without a
 * visible fetch. Returns the cleanup for the mounting effect.
 */
export function scheduleOnboardingConversationPreload(
  element: HTMLElement | null
): () => void {
  const warm = () => preloadOnboardingConversationChunks();
  if (!element) return () => undefined;
  for (const event of CONVERSATION_WARM_EVENTS) {
    element.addEventListener(event, warm, {
      capture: true,
      once: true,
      passive: true,
    });
  }
  return () => {
    for (const event of CONVERSATION_WARM_EVENTS) {
      element.removeEventListener(event, warm, { capture: true });
    }
  };
}
