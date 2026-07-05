/**
 * Chat system-prompt registry — source of truth for Langfuse prompt linkage.
 *
 * Week 1: local version constants mirrored in Langfuse Cloud prompt registry.
 * Bump `version` when the prompt body changes; keep `versionId` stable for
 * cross-release trace filters.
 */

export type ChatPromptRegistryEntry = {
  readonly name: string;
  readonly version: number;
  /** Stable identifier wired into Langfuse generation metadata. */
  readonly versionId: string;
};

export const CHAT_PROMPT_REGISTRY = {
  app: {
    name: 'jovie-chat-app-system',
    version: 1,
    versionId: 'jovie-chat-app-system:v1',
  },
  onboarding: {
    name: 'jovie-chat-onboarding-system',
    version: 1,
    versionId: 'jovie-chat-onboarding-system:v1',
  },
} as const satisfies Record<'app' | 'onboarding', ChatPromptRegistryEntry>;

export function resolveChatPromptRegistryEntry(
  mode: 'app' | 'onboarding'
): ChatPromptRegistryEntry {
  return mode === 'onboarding'
    ? CHAT_PROMPT_REGISTRY.onboarding
    : CHAT_PROMPT_REGISTRY.app;
}
