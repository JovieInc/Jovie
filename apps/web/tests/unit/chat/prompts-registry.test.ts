import { describe, expect, it } from 'vitest';

import {
  CHAT_PROMPT_REGISTRY,
  resolveChatPromptRegistryEntry,
} from '@/lib/chat/prompts/registry';

describe('chat prompt registry', () => {
  it('maps app mode to the app system prompt entry', () => {
    expect(resolveChatPromptRegistryEntry('app')).toEqual(
      CHAT_PROMPT_REGISTRY.app
    );
  });

  it('maps onboarding mode to the onboarding system prompt entry', () => {
    expect(resolveChatPromptRegistryEntry('onboarding')).toEqual(
      CHAT_PROMPT_REGISTRY.onboarding
    );
  });

  it('exposes stable prompt_version_id values for Langfuse linkage', () => {
    expect(CHAT_PROMPT_REGISTRY.app.versionId).toBe('jovie-chat-app-system:v1');
    expect(CHAT_PROMPT_REGISTRY.onboarding.versionId).toBe(
      'jovie-chat-onboarding-system:v1'
    );
  });
});
