import { describe, expect, it } from 'vitest';
import { sanitizeAssistantResponse } from '@/lib/chat/prompt-disclosure-guard';
import { extractEntities, extractSkill, parseTokens } from '@/lib/chat/tokens';
import { encodeMobileChatNdjsonEvent } from '@/lib/mobile/chat/contract';

/**
 * Durable contract guard for JOV-3608 (entity/skill chips missing on iOS).
 *
 * `handleMobileChatTurn` (apps/web/lib/mobile/chat/turn-handler.ts) streams
 * `streamResult.textStream` deltas verbatim to the client via
 * `assistant.delta` NDJSON events, then runs the accumulated `fullText`
 * through exactly one transform — `sanitizeAssistantResponse` — before
 * persisting it and emitting the final `assistant.completed` event. No other
 * step in that path touches the wire-format `@kind:id[label]` / `/skill:id`
 * tokens defined in apps/web/lib/chat/tokens.ts.
 *
 * These tests assert that path is lossless for tokens, so any future
 * regression that strips or mangles tokens before they reach the iOS client
 * fails here first — instead of silently rendering raw tokens in the native
 * chat transcript (the JOV-3608 symptom).
 */
describe('mobile chat turn handler: entity + skill token passthrough', () => {
  const mixedMessage =
    'Check out @release:rel_1[Midnight Drive] and try /skill:generateAlbumArt for @artist:art_2[Porter Robinson]';

  it('sanitizeAssistantResponse does not alter entity/skill tokens on the happy path', () => {
    const result = sanitizeAssistantResponse(mixedMessage);

    expect(result.leaked).toBe(false);
    expect(result.text).toBe(mixedMessage);
    expect(extractEntities(result.text)).toEqual([
      {
        type: 'entity',
        kind: 'release',
        id: 'rel_1',
        label: 'Midnight Drive',
      },
      { type: 'entity', kind: 'artist', id: 'art_2', label: 'Porter Robinson' },
    ]);
    expect(extractSkill(result.text)).toEqual({
      type: 'skill',
      id: 'generateAlbumArt',
    });
  });

  it('sanitizeAssistantResponse preserves tokens with escaped brackets in labels', () => {
    const message = '@track:trk_9[Live at Brooklyn Steel [2026\\]] is out now';
    const result = sanitizeAssistantResponse(message);

    expect(result.leaked).toBe(false);
    expect(result.text).toBe(message);
    expect(parseTokens(result.text)).toEqual([
      {
        type: 'entity',
        kind: 'track',
        id: 'trk_9',
        label: 'Live at Brooklyn Steel [2026]',
      },
      { type: 'text', value: ' is out now' },
    ]);
  });

  it('sanitizeAssistantResponse preserves an event entity token', () => {
    const message = 'See you at @event:evt_5[Coachella 2027]';
    const result = sanitizeAssistantResponse(message);

    expect(result.text).toBe(message);
    expect(result.leaked).toBe(false);
  });

  it('encodeMobileChatNdjsonEvent round-trips entity/skill tokens byte-for-byte through the NDJSON wire format', () => {
    const encoded = encodeMobileChatNdjsonEvent({
      type: 'assistant.completed',
      clientTurnId: 'turn_1',
      conversationId: 'conv_1',
      turnId: 'turn_db_1',
      text: mixedMessage,
    });

    expect(encoded.endsWith('\n')).toBe(true);
    const decoded = JSON.parse(encoded.trimEnd()) as { text: string };
    expect(decoded.text).toBe(mixedMessage);
    expect(extractEntities(decoded.text)).toHaveLength(2);
    expect(extractSkill(decoded.text)?.id).toBe('generateAlbumArt');
  });

  it('encodeMobileChatNdjsonEvent round-trips tokens split across streaming deltas', () => {
    // Mirrors how handleMobileChatTurn accumulates `fullText` from
    // `assistant.delta` events before it ever re-parses tokens.
    const deltas = [
      'Grab ',
      '@release:rel_1[Midnight ',
      'Drive] now, or run ',
      '/skill:generateAlbumArt',
      ' first.',
    ];
    const fullText = deltas.join('');

    // Each individual delta event must still encode/decode losslessly, even
    // though a token can be split mid-stream across two deltas.
    for (const delta of deltas) {
      const encoded = encodeMobileChatNdjsonEvent({
        type: 'assistant.delta',
        clientTurnId: 'turn_1',
        text: delta,
      });
      const decoded = JSON.parse(encoded.trimEnd()) as { text: string };
      expect(decoded.text).toBe(delta);
    }

    // The fully accumulated text still parses into the expected tokens once
    // all deltas have arrived client-side.
    expect(parseTokens(fullText)).toEqual([
      { type: 'text', value: 'Grab ' },
      { type: 'entity', kind: 'release', id: 'rel_1', label: 'Midnight Drive' },
      { type: 'text', value: ' now, or run ' },
      { type: 'skill', id: 'generateAlbumArt' },
      { type: 'text', value: ' first.' },
    ]);
  });
});
