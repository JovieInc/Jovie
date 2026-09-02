import { beforeEach, describe, expect, it } from 'vitest';
import {
  h,
  handleMobileOvChatTurn,
  ovInput,
  resetSummerMocks,
  summerBinding,
} from './ov-workspace.summer-test-fixture';

describe('mobile Ovie Summer safety', () => {
  beforeEach(resetSummerMocks);

  it('reports retry contention with the canonical in-progress contract', async () => {
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
    h.resumeTerminalChatTurn.mockResolvedValueOnce('conflict');

    const response = await handleMobileOvChatTurn(ovInput);

    expect(response.status).toBe(409);
    expect(await response.text()).toContain('TURN_IN_PROGRESS');
  });

  it('reports durability failure separately from retry contention', async () => {
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
    h.resumeTerminalChatTurn.mockResolvedValueOnce('error');

    const response = await handleMobileOvChatTurn(ovInput);

    expect(response.status).toBe(503);
    expect(await response.text()).toContain('SUMMER_DURABILITY_FAILED');
  });

  it('replays a non-retryable terminal failure as an error, never a completion', async () => {
    h.reserveChatTurn.mockResolvedValueOnce({
      outcome: 'duplicate_completed',
      conversationId: 'conv_ov',
      turn: {
        id: 'turn_ov',
        status: 'failed_tool_unavailable',
        errorCode: 'SUMMER_TOOL_FAILED',
        errorMessage: 'Tool failed.',
      },
      messages: [],
    });

    const response = await handleMobileOvChatTurn(ovInput);
    const body = await response.text();

    expect(body).toContain('SUMMER_TOOL_FAILED');
    expect(body).not.toContain('assistant.completed');
    expect(h.runOvieSummerTurn).not.toHaveBeenCalled();
  });

  it('rate limits the admin queue before enqueueing Summer work', async () => {
    h.checkAiChatRateLimitForPlan.mockResolvedValueOnce({
      success: false,
      reason: 'Slow down.',
    });

    const response = await handleMobileOvChatTurn(ovInput);
    const body = await response.text();

    expect(body).toContain('RATE_LIMITED');
    expect(body).not.toContain('assistant.completed');
    expect(h.markChatTurnTerminal).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed_model_error',
        errorCode: 'RATE_LIMITED',
      })
    );
    expect(h.prepareOvieChatTurn).not.toHaveBeenCalled();
  });

  it('keeps a real quota denial non-retryable when an earlier limiter degraded', async () => {
    h.checkAiChatRateLimitForPlan.mockResolvedValueOnce({
      success: false,
      degraded: true,
      reason: 'Daily limit reached.',
    });

    const response = await handleMobileOvChatTurn(ovInput);
    const body = await response.text();

    expect(body).toContain('RATE_LIMITED');
    expect(body).not.toContain('SUMMER_ADMISSION_UNAVAILABLE');
    expect(body).toContain('Daily limit reached.');
    expect(h.prepareOvieChatTurn).not.toHaveBeenCalled();
  });

  it.each([
    'degraded',
    'unavailable',
  ])('fails closed when the admin admission limiter is %s', async mode => {
    h.checkAiChatRateLimitForPlan.mockResolvedValueOnce({
      success: true,
      [mode]: true,
    });

    const response = await handleMobileOvChatTurn(ovInput);
    const body = await response.text();

    expect(body).toContain('SUMMER_ADMISSION_UNAVAILABLE');
    expect(body).toContain('admission control');
    expect(h.prepareOvieChatTurn).not.toHaveBeenCalled();
  });

  it('reclaims the same turn after admission control recovers', async () => {
    h.checkAiChatRateLimitForPlan
      .mockResolvedValueOnce({ success: true, degraded: true })
      .mockResolvedValueOnce({ success: true });

    const first = await handleMobileOvChatTurn(ovInput);
    expect(await first.text()).toContain('SUMMER_ADMISSION_UNAVAILABLE');

    h.reserveChatTurn.mockResolvedValueOnce({
      outcome: 'duplicate_completed',
      conversationId: 'conv_ov',
      turn: {
        id: 'turn_ov',
        status: 'failed_model_error',
        errorCode: 'SUMMER_ADMISSION_UNAVAILABLE',
        errorMessage: 'Summer admission control is temporarily unavailable.',
      },
      messages: [],
    });

    const recovered = await handleMobileOvChatTurn(ovInput);
    expect(h.resumeTerminalChatTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        turnId: 'turn_ov',
        errorCode: 'SUMMER_ADMISSION_UNAVAILABLE',
      })
    );
    expect(await recovered.text()).toContain('assistant.completed');
  });

  it('reclaims a stale in-flight turn after an unconfirmed terminal write', async () => {
    h.reserveChatTurn.mockResolvedValueOnce({
      outcome: 'duplicate_in_progress',
      conversationId: 'conv_ov',
      turn: {
        id: 'turn_ov',
        status: 'streaming',
        updatedAt: new Date(Date.now() - 61_000),
      },
    });
    const response = await handleMobileOvChatTurn(ovInput);
    const body = await response.text();

    expect(h.resumeStaleChatTurn).toHaveBeenCalled();
    expect(body).toContain('assistant.completed');
  });

  it('terminalizes a mid-stream disconnect without emitting a false completion', async () => {
    const abort = new AbortController();
    let releaseSummer: (() => void) | undefined;
    const summerGate = new Promise<void>(resolve => {
      releaseSummer = resolve;
    });
    h.runOvieSummerTurn.mockImplementationOnce(async function* () {
      yield summerBinding;
      yield { type: 'state', state: 'streaming' };
      yield { type: 'text-delta', text: 'Started' };
      await summerGate;
      yield { type: 'state', state: 'completed' };
    });

    const response = await handleMobileOvChatTurn({
      ...ovInput,
      signal: abort.signal,
    });
    const reader = response.body?.getReader();
    expect(reader).toBeDefined();
    const decoder = new TextDecoder();
    let body = '';
    const reservedChunk = await reader?.read();
    expect(reservedChunk?.done).toBe(false);
    body += decoder.decode(reservedChunk?.value, { stream: true });
    expect(body).toContain('turn.reserved');

    abort.abort();
    releaseSummer?.();
    while (true) {
      const chunk = await reader?.read();
      if (!chunk || chunk.done) break;
      body += decoder.decode(chunk.value, { stream: true });
    }

    expect(body).not.toContain('Started');
    expect(body).not.toContain('assistant.completed');
    expect(body).not.toContain('SUMMER_TURN_CANCELED');
    expect(h.markChatTurnTerminal).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'canceled',
        errorCode: 'SUMMER_TURN_CANCELED',
      })
    );
  });

  it('persists cancellation when the Summer iterator throws after abort', async () => {
    const abort = new AbortController();
    abort.abort();
    h.runOvieSummerTurn.mockImplementationOnce(async function* () {
      throw new Error('aborted transport');
    });

    const response = await handleMobileOvChatTurn({
      ...ovInput,
      signal: abort.signal,
    });

    expect(await response.text()).toBe('');
    expect(h.markChatTurnTerminal).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'canceled',
        errorCode: 'SUMMER_TURN_CANCELED',
      })
    );
  });

  it('persists a transport failure with the matching terminal status and code', async () => {
    h.runOvieSummerTurn.mockImplementationOnce(async function* () {
      yield summerBinding;
      yield { type: 'state', state: 'streaming' };
      yield { type: 'state', state: 'failure' };
    });

    const response = await handleMobileOvChatTurn(ovInput);
    const body = await response.text();

    expect(body).toContain('SUMMER_TRANSPORT_FAILED');
    expect(h.markChatTurnTerminal).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed_model_error',
        errorCode: 'SUMMER_TRANSPORT_FAILED',
      })
    );
  });

  it('returns a successful safe-tool summary when Summer emits no prose', async () => {
    h.runOvieSummerTurn.mockImplementationOnce(async function* () {
      yield summerBinding;
      yield {
        type: 'tool',
        receipt: {
          tool: 'get_org_state',
          ok: true,
          receiptId: 'receipt_1',
          summary: 'Shipping state refreshed.',
        },
      };
      yield { type: 'state', state: 'completed' };
    });

    const response = await handleMobileOvChatTurn(ovInput);
    const body = await response.text();

    expect(body).toContain('"type":"assistant.completed"');
    expect(body).toContain('Shipping state refreshed.');
    expect(h.persistTerminalAssistantMessageWithReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        content: 'Shipping state refreshed.',
      })
    );
  });

  it('does not emit completion when durable success persistence is unconfirmed', async () => {
    h.persistTerminalAssistantMessageWithReceipt.mockResolvedValueOnce({
      message: { id: 'ephemeral-turn_ov' },
      persisted: false,
    });

    const response = await handleMobileOvChatTurn(ovInput);
    const body = await response.text();

    expect(body).toContain('SUMMER_DURABILITY_FAILED');
    expect(body).not.toContain('assistant.completed');
    expect(body).not.toContain('Summer reply');
  });

  it('buffers and rejects forbidden speaker identity before emitting text', async () => {
    h.runOvieSummerTurn.mockImplementationOnce(async function* () {
      yield summerBinding;
      yield { type: 'text-delta', text: 'I am Ovie' };
      yield { type: 'state', state: 'completed' };
    });

    const response = await handleMobileOvChatTurn(ovInput);
    const body = await response.text();

    expect(body).toContain('SUMMER_TRANSPORT_FAILED');
    expect(body).not.toContain('I am Ovie');
    expect(body).not.toContain('assistant.completed');
  });

  it.each([
    {
      name: 'unsafe tool failure',
      events: [
        {
          type: 'tool',
          receipt: {
            tool: 'write_file',
            ok: false,
            receiptId: 'receipt_unsafe',
            summary: 'Denied.',
          },
        },
        { type: 'state', state: 'failed_tool' },
      ],
      status: 'failed_tool_unavailable',
      errorCode: 'SUMMER_TOOL_FAILED',
    },
    {
      name: 'empty completed turn',
      events: [{ type: 'state', state: 'completed' }],
      status: 'failed_model_error',
      errorCode: 'SUMMER_EMPTY_COMPLETION',
    },
  ])('persists $name as a typed terminal error', async scenario => {
    h.runOvieSummerTurn.mockImplementationOnce(async function* () {
      yield summerBinding;
      for (const event of scenario.events) yield event;
    });

    const response = await handleMobileOvChatTurn(ovInput);
    const body = await response.text();

    expect(body).toContain(scenario.errorCode);
    expect(h.markChatTurnTerminal).toHaveBeenCalledWith(
      expect.objectContaining({
        status: scenario.status,
        errorCode: scenario.errorCode,
      })
    );
  });

  it('maps a thrown Summer iterator to the durable network failure contract', async () => {
    h.runOvieSummerTurn.mockImplementationOnce(async function* () {
      throw new Error('Summer bridge offline');
    });

    const response = await handleMobileOvChatTurn(ovInput);
    const body = await response.text();

    expect(body).toContain('SUMMER_TRANSPORT_FAILED');
    expect(h.markChatTurnTerminal).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed_network',
        errorCode: 'SUMMER_TRANSPORT_FAILED',
      })
    );
  });

  it('surfaces terminal persistence failure instead of a false domain receipt', async () => {
    h.markChatTurnTerminal.mockResolvedValueOnce(false);
    h.runOvieSummerTurn.mockImplementationOnce(async function* () {
      yield summerBinding;
      yield { type: 'state', state: 'unavailable' };
    });

    const response = await handleMobileOvChatTurn(ovInput);
    const body = await response.text();

    expect(body).toContain('SUMMER_DURABILITY_FAILED');
    expect(body).not.toContain('SUMMER_TEMPORARILY_UNAVAILABLE');
  });

  it('marks the Ovie door and streams the durable reply contract', async () => {
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

  it('reports an unavailable Summer session as a typed network failure', async () => {
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

    const response = await handleMobileOvChatTurn(ovInput);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('unavailable');
    expect(body).not.toContain('assistant.completed');
    expect(h.markChatTurnTerminal).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed_network',
        errorCode: 'SUMMER_TRANSPORT_UNAVAILABLE',
      })
    );
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
