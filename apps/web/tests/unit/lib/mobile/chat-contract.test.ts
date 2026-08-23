import { describe, expect, it } from 'vitest';
import {
  buildMobileChatHandoffUrl,
  encodeMobileChatNdjsonEvent,
  parseMobileChatTurnRequest,
} from '@/lib/mobile/chat/contract';

describe('mobile chat contract', () => {
  it('parses valid mobile turn requests', () => {
    expect(
      parseMobileChatTurnRequest({
        conversationId: 'conv_1',
        clientTurnId: 'turn_1',
        clientMessageId: 'msg_1',
        text: '  Help me launch  ',
        source: 'typed',
      })
    ).toEqual({
      conversationId: 'conv_1',
      clientTurnId: 'turn_1',
      clientMessageId: 'msg_1',
      text: 'Help me launch',
      source: 'typed',
      chatMode: null,
    });
  });

  it('keeps parsed chatMode null so the route layer owns ov vs artist routing', () => {
    expect(
      parseMobileChatTurnRequest({
        conversationId: 'conv_1',
        clientTurnId: 'turn_1',
        clientMessageId: 'msg_1',
        text: 'Summer, what is blocked?',
        source: 'typed',
        chatMode: 'ov',
      })
    ).toMatchObject({
      text: 'Summer, what is blocked?',
      chatMode: null,
    });
  });

  it('rejects invalid mobile turn requests', () => {
    expect(
      parseMobileChatTurnRequest({
        text: 'missing ids',
        source: 'typed',
      })
    ).toBeNull();
  });

  it('encodes NDJSON events with trailing newline', () => {
    expect(
      encodeMobileChatNdjsonEvent({
        type: 'assistant.delta',
        clientTurnId: 'turn_1',
        text: 'Hello',
      })
    ).toBe(
      '{"type":"assistant.delta","clientTurnId":"turn_1","text":"Hello"}\n'
    );
  });

  it('builds canonical web handoff URLs', () => {
    expect(buildMobileChatHandoffUrl('conv_123')).toBe('/app/chat/conv_123');
  });
});
