import { describe, expect, it } from 'vitest';
import { encodeMobileChatNdjsonEvent } from '@/lib/mobile/chat/contract';
import {
  authorizeEyesFreeDestination,
  chatModeForEyesFreeDestination,
  EYES_FREE_ERROR,
  eyesFreeReadback,
  parseEyesFreeDestination,
  parseEyesFreeIdempotencyKey,
  parseEyesFreeTranscript,
  readbackFromMobileChatResponse,
} from './eyes-free-capture';

describe('eyes-free capture routing', () => {
  it('accepts only the closed destination enum and existing chat modes', () => {
    expect(parseEyesFreeDestination('jovie')).toBe('jovie');
    expect(parseEyesFreeDestination('summer')).toBe('summer');
    expect(parseEyesFreeDestination('ov')).toBeNull();
    expect(parseEyesFreeDestination('kanban')).toBeNull();
    expect(parseEyesFreeDestination('/bin/sh')).toBeNull();
    expect(parseEyesFreeDestination({ dest: 'summer' })).toBeNull();
    expect(chatModeForEyesFreeDestination('jovie')).toBeNull();
    expect(chatModeForEyesFreeDestination('summer')).toBe('ov');
  });

  it('rejects Summer for ordinary users and allows founder/admin', () => {
    expect(authorizeEyesFreeDestination('jovie', false)).toEqual({ ok: true });
    expect(authorizeEyesFreeDestination('jovie', true)).toEqual({ ok: true });
    expect(authorizeEyesFreeDestination('summer', true)).toEqual({ ok: true });
    expect(authorizeEyesFreeDestination('summer', false)).toEqual({
      ok: false,
      status: 403,
      errorCode: EYES_FREE_ERROR.SUMMER_FORBIDDEN,
    });
  });

  it('rejects empty transcripts and short idempotency keys', () => {
    expect(parseEyesFreeTranscript('  draft a drop  ')).toBe('draft a drop');
    expect(parseEyesFreeTranscript('   ')).toBeNull();
    expect(parseEyesFreeTranscript('')).toBeNull();
    expect(parseEyesFreeTranscript(null)).toBeNull();
    expect(parseEyesFreeTranscript('x'.repeat(4001))).toBeNull();
    expect(parseEyesFreeIdempotencyKey('turn_abc1')).toBe('turn_abc1');
    expect(parseEyesFreeIdempotencyKey('short')).toBeNull();
    expect(parseEyesFreeIdempotencyKey('x'.repeat(129))).toBeNull();
    expect(parseEyesFreeIdempotencyKey(12)).toBeNull();
  });

  it('speaks founder-only rejection without leaking a hidden switch', () => {
    expect(
      eyesFreeReadback({ destination: 'summer', status: 'forbidden' })
    ).toBe('Summer is only available to the founder.');
    expect(
      eyesFreeReadback({
        destination: 'jovie',
        status: 'completed',
        assistantText: 'I drafted a release post.',
      })
    ).toBe('I drafted a release post.');
  });

  it('replays completed Jovie creative follow-through as durable readback', () => {
    const body = [
      encodeMobileChatNdjsonEvent({
        type: 'turn.reserved',
        conversationId: 'conv_1',
        turnId: 'turn_1',
        clientTurnId: 'client_1',
      }),
      encodeMobileChatNdjsonEvent({
        type: 'assistant.completed',
        clientTurnId: 'client_1',
        conversationId: 'conv_1',
        turnId: 'turn_1',
        text: 'Here is a caption for your drop.',
      }),
    ].join('');
    expect(
      readbackFromMobileChatResponse({
        destination: 'jovie',
        httpStatus: 200,
        body,
      })
    ).toMatchObject({
      status: 'completed',
      conversationId: 'conv_1',
      readback: 'Here is a caption for your drop.',
    });
  });

  it('maps in-flight duplicates, failed follow-through, and Summer 403', () => {
    const statusOf = (
      destination: 'jovie' | 'summer',
      httpStatus: number,
      event: Parameters<typeof encodeMobileChatNdjsonEvent>[0]
    ) =>
      readbackFromMobileChatResponse({
        destination,
        httpStatus,
        body: encodeMobileChatNdjsonEvent(event),
      });

    expect(
      statusOf('summer', 200, {
        type: 'assistant.completed',
        clientTurnId: 'client_1',
        conversationId: 'conv_1',
        turnId: 'turn_1',
        text: 'Already captured.',
      }).status
    ).toBe('duplicate');
    expect(
      statusOf('jovie', 409, {
        type: 'error',
        errorCode: 'TURN_IN_PROGRESS',
        message: 'still running',
      }).status
    ).toBe('in_progress');
    expect(
      statusOf('summer', 403, {
        type: 'error',
        errorCode: 'OV_CHAT_FORBIDDEN',
        message: 'Admin role required for Ovie chat.',
      })
    ).toMatchObject({
      status: 'forbidden',
      errorCode: EYES_FREE_ERROR.SUMMER_FORBIDDEN,
    });
    expect(
      statusOf('jovie', 200, {
        type: 'error',
        errorCode: 'CHAT_STREAM_FAILED',
        message: 'model failed',
      }).status
    ).toBe('failed');
  });
});
