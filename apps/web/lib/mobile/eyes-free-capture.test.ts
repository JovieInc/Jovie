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
  it('accepts only the closed destination enum', () => {
    expect(parseEyesFreeDestination('jovie')).toBe('jovie');
    expect(parseEyesFreeDestination('summer')).toBe('summer');
    expect(parseEyesFreeDestination('ov')).toBeNull();
    expect(parseEyesFreeDestination('kanban')).toBeNull();
    expect(parseEyesFreeDestination('/bin/sh')).toBeNull();
    expect(parseEyesFreeDestination({ dest: 'summer' })).toBeNull();
  });

  it('maps destinations onto existing chat modes without a client switch', () => {
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

  it('rejects empty, oversized, and non-string transcripts', () => {
    expect(parseEyesFreeTranscript('  draft a drop  ')).toBe('draft a drop');
    expect(parseEyesFreeTranscript('   ')).toBeNull();
    expect(parseEyesFreeTranscript('')).toBeNull();
    expect(parseEyesFreeTranscript(null)).toBeNull();
    expect(parseEyesFreeTranscript('x'.repeat(4001))).toBeNull();
  });

  it('requires a durable idempotency key for retries of the same gesture', () => {
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
    ).toEqual({
      destination: 'jovie',
      status: 'completed',
      conversationId: 'conv_1',
      turnId: 'turn_1',
      readback: 'Here is a caption for your drop.',
      errorCode: null,
    });
  });

  it('treats a replayed completed turn as idempotent duplicate', () => {
    const body = encodeMobileChatNdjsonEvent({
      type: 'assistant.completed',
      clientTurnId: 'client_1',
      conversationId: 'conv_1',
      turnId: 'turn_1',
      text: 'Already captured.',
    });

    expect(
      readbackFromMobileChatResponse({
        destination: 'summer',
        httpStatus: 200,
        body,
      }).status
    ).toBe('duplicate');
  });

  it('maps in-flight duplicates, failed transcription follow-through, and Summer 403', () => {
    expect(
      readbackFromMobileChatResponse({
        destination: 'jovie',
        httpStatus: 409,
        body: encodeMobileChatNdjsonEvent({
          type: 'error',
          errorCode: 'TURN_IN_PROGRESS',
          message: 'still running',
        }),
      }).status
    ).toBe('in_progress');

    expect(
      readbackFromMobileChatResponse({
        destination: 'summer',
        httpStatus: 403,
        body: encodeMobileChatNdjsonEvent({
          type: 'error',
          errorCode: 'OV_CHAT_FORBIDDEN',
          message: 'Admin role required for Ovie chat.',
        }),
      })
    ).toMatchObject({
      status: 'forbidden',
      errorCode: EYES_FREE_ERROR.SUMMER_FORBIDDEN,
      readback: 'Summer is only available to the founder.',
    });

    expect(
      readbackFromMobileChatResponse({
        destination: 'jovie',
        httpStatus: 200,
        body: encodeMobileChatNdjsonEvent({
          type: 'error',
          errorCode: 'CHAT_STREAM_FAILED',
          message: 'model failed',
        }),
      }).status
    ).toBe('failed');
  });
});
