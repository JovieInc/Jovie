import { describe, expect, it } from 'vitest';

import { respondToJovieCoreChat } from '../agent/lib/jovie-core-chat-mock-model';

const emptyRequest = {
  lastUserMessage: 'Describe the core_chat capability boundary.',
  messages: [],
  toolResults: [] as const,
  tools: [{ name: 'jovie_capability_manifest' }],
  userMessageCount: 1,
  userMessages: ['Describe the core_chat capability boundary.'],
};

describe('jovie core-chat mock model', () => {
  it('requests the shipped capability tool on the first step', () => {
    const response = respondToJovieCoreChat(emptyRequest);
    expect(response).toEqual({
      toolCalls: [
        {
          name: 'jovie_capability_manifest',
          input: { capability: 'core_chat' },
        },
      ],
    });
  });

  it('summarizes a read-only tool result without echoing leak canaries', () => {
    const response = respondToJovieCoreChat({
      ...emptyRequest,
      toolResults: [
        {
          id: 'call-1',
          name: 'jovie_capability_manifest',
          isError: false,
          output: {
            capability: 'core_chat',
            mode: 'read_only',
            writePerformed: false,
            externalAccess: false,
            pilot: true,
          },
        },
      ],
    });
    expect(response).toContain('writePerformed=false');
    expect(response).toContain('mode=read_only');
    expect(String(response)).not.toContain('sk_live_LEAK_CANARY');
  });
});
