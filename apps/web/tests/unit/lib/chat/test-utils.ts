/**
 * Test utilities for chat/intent testing.
 * Provides mock factories for common chat test scenarios.
 */

import type { HandlerContext } from '@/lib/intent-detection/handlers/types';
import type { DetectedIntent } from '@/lib/intent-detection/types';
import { IntentCategory } from '@/lib/intent-detection/types';

export function createMockContext(
  overrides?: Partial<HandlerContext>
): HandlerContext {
  return {
    clerkUserId: 'user_test_123',
    profileId: 'profile_test_456',
    ...overrides,
  };
}

export function createMockIntent(
  category: IntentCategory,
  extractedData: Record<string, string> = {},
  rawMessage = 'test message'
): DetectedIntent {
  return {
    category,
    confidence: 1.0,
    extractedData,
    rawMessage,
  };
}

export function createMockUIMessage(role: 'user' | 'assistant', text: string) {
  return {
    id: `msg_${Math.random().toString(36).slice(2)}`,
    role,
    parts: [{ type: 'text' as const, text }],
    createdAt: new Date(),
  };
}

export function createMockConversation(messages: string[]) {
  return messages.map((text, i) =>
    createMockUIMessage(i % 2 === 0 ? 'user' : 'assistant', text)
  );
}
