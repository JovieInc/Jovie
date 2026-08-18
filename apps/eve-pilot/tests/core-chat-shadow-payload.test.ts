import { describe, expect, it } from 'vitest';

import {
  coreChatSessionBody,
  sessionBodyHasForbiddenKeys,
} from '../evals/core-chat/shadow-payload';

describe('core-chat shadow session payload', () => {
  it('never includes user id, system prompt, or credentials', () => {
    const body = coreChatSessionBody(
      'How should I pitch this release?',
      'request-eve-1'
    );

    expect(sessionBodyHasForbiddenKeys(body)).toEqual([]);
    expect(body).toEqual({
      message: 'How should I pitch this release?',
      clientContext: {
        source: 'jovie-core-chat',
        protocolVersion: 1,
        requestId: 'request-eve-1',
        mode: 'shadow',
        selectedModel: 'fixture',
        toolNames: ['jovie_capability_manifest'],
        readOnly: true,
      },
    });
    expect(body).not.toHaveProperty('userId');
    expect(body).not.toHaveProperty('systemPrompt');
    expect(JSON.stringify(body)).not.toMatch(/sk-|OPENAI_API_KEY|Bearer /);
  });

  it('bounds the user text to 4000 characters', () => {
    const body = coreChatSessionBody('x'.repeat(5000), 'request-bound');
    expect(body.message).toHaveLength(4000);
  });
});
