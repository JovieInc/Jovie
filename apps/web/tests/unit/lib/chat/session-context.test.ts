import { describe, expect, it } from 'vitest';
import { classifyIntent, isDeterministicIntent } from '@/lib/intent-detection';
import { IntentCategory } from '@/lib/intent-detection/types';
import { createMockUIMessage } from './test-utils';

describe('session context and intent detection', () => {
  describe('message extraction from UI messages', () => {
    it('extracts text from a single-part user message', () => {
      const msg = createMockUIMessage('user', 'change my name to Test');
      const text = msg.parts
        .filter(
          (p): p is { type: 'text'; text: string } =>
            p.type === 'text' && typeof p.text === 'string'
        )
        .map(p => p.text)
        .join('')
        .trim();

      expect(text).toBe('change my name to Test');
      const intent = classifyIntent(text);
      expect(intent).not.toBeNull();
      expect(intent!.category).toBe(IntentCategory.PROFILE_UPDATE_NAME);
    });

    it('skips assistant messages for intent classification', () => {
      const messages = [
        createMockUIMessage('user', 'hello'),
        createMockUIMessage('assistant', 'change my name to Shadow'),
      ];

      const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
      expect(lastUserMsg).toBeDefined();

      const text = lastUserMsg!.parts
        .filter(
          (p): p is { type: 'text'; text: string } =>
            p.type === 'text' && typeof p.text === 'string'
        )
        .map(p => p.text)
        .join('')
        .trim();

      // "hello" should not classify as any intent
      expect(classifyIntent(text)).toBeNull();
    });
  });

  describe('intent routing decisions', () => {
    it('deterministic intents skip AI path', () => {
      const intent = classifyIntent('change my name to DJ Shadow');
      expect(isDeterministicIntent(intent)).toBe(true);
    });

    it('conversational messages go to AI path', () => {
      const intent = classifyIntent('what should I do to grow my audience?');
      expect(isDeterministicIntent(intent)).toBe(false);
    });

    it('ambiguous messages go to AI path', () => {
      const intent = classifyIntent('can you help me with my name');
      expect(isDeterministicIntent(intent)).toBe(false);
    });

    it('complex bio requests go to AI path', () => {
      const intent = classifyIntent('write me a creative bio');
      expect(isDeterministicIntent(intent)).toBe(false);
    });
  });

  describe('intent priority ordering', () => {
    it('name update takes priority over generic name mention', () => {
      const intent = classifyIntent('change my name to Nova');
      expect(intent!.category).toBe(IntentCategory.PROFILE_UPDATE_NAME);
    });

    it('link add with URL takes priority over platform-only', () => {
      const intent = classifyIntent('add instagram https://instagram.com/test');
      expect(intent!.category).toBe(IntentCategory.LINK_ADD);
      expect(intent!.extractedData.url).toBeDefined();
    });
  });
});
