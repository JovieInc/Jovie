import { beforeEach, describe, expect, it } from 'vitest';
import {
  h,
  handleMobileOvChatTurn,
  ovInput,
  resetSummerMocks,
} from './ov-workspace.summer-test-fixture';
import {
  isOvConversationTitle,
  parseMobileWorkspace,
  withOvConversationTitle,
} from './workspace';

describe('mobile Ovie workspace', () => {
  beforeEach(resetSummerMocks);

  it('parses ids and keeps Summer off the artist path', async () => {
    expect(parseMobileWorkspace('ov')).toEqual({ ok: true, workspace: 'ov' });
    expect(isOvConversationTitle(withOvConversationTitle('Taste'))).toBe(true);
    h.canUseOvChatMode.mockResolvedValue(false);
    expect((await handleMobileOvChatTurn(ovInput)).status).toBe(403);
    h.canUseOvChatMode.mockResolvedValue(true);
    h.isSummerTransportEnabled.mockReturnValue(false);
    h.prepareOvieChatTurn.mockResolvedValueOnce({
      receipts: [],
      generation: {
        kind: 'summer-transport',
        state: 'unavailable',
        speaker: 'summer',
        session: null,
        text: 'Conversation with the current Summer is unavailable on this door.',
      },
    });
    const unavailable = await handleMobileOvChatTurn(ovInput);
    const unavailableBody = await unavailable.text();
    expect(unavailable.status).toBe(200);
    expect(unavailableBody).toContain('unavailable');
    expect(unavailableBody).not.toContain('assistant.completed');
    expect(h.markChatTurnTerminal).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed_network',
        errorCode: 'SUMMER_TRANSPORT_UNAVAILABLE',
      })
    );
  });

  it('streams the durable Summer queue reply through the mobile contract', async () => {
    const response = await handleMobileOvChatTurn(ovInput);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('x-ovie-door')).toBe('1');
    expect(response.headers.get('x-ovie-summer-speaker')).toBe('summer');
    expect(h.runOvieSummerTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        clientTurnId: 't1',
        userText: 'Need a taste decision',
      })
    );
    expect(body).toContain('"type":"turn.reserved"');
    expect(body).toContain('"type":"assistant.delta"');
    expect(body).toContain('"type":"assistant.completed"');
    expect(body).toContain('Summer reply');
  });

  it('keeps the existing duplicate-in-progress contract while the first request owns the stream', async () => {
    h.reserveChatTurn.mockResolvedValueOnce({
      outcome: 'duplicate_in_progress',
      conversationId: 'conv_ov',
      turn: { id: 'turn_ov', status: 'streaming' },
    });

    const response = await handleMobileOvChatTurn(ovInput);

    expect(response.status).toBe(409);
    expect(await response.text()).toContain('TURN_IN_PROGRESS');
    expect(h.runOvieSummerTurn).not.toHaveBeenCalled();
  });

  it('reclaims a retryable terminal turn with the same client identifier', async () => {
    h.reserveChatTurn.mockResolvedValueOnce({
      outcome: 'duplicate_completed',
      conversationId: 'conv_ov',
      turn: {
        id: 'turn_ov',
        status: 'failed_timeout',
        errorCode: 'SUMMER_TEMPORARILY_UNAVAILABLE',
        errorMessage: 'Summer timed out.',
      },
      messages: [],
    });

    const response = await handleMobileOvChatTurn(ovInput);
    const body = await response.text();

    expect(h.resumeTerminalChatTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        turnId: 'turn_ov',
        status: 'failed_timeout',
        errorCode: 'SUMMER_TEMPORARILY_UNAVAILABLE',
      })
    );
    expect(h.runOvieSummerTurn).toHaveBeenCalled();
    expect(body).toContain('assistant.completed');
  });
});
