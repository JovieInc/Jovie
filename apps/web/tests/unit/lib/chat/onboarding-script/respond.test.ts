import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { FallbackTurn } from '@/lib/chat/onboarding-script/engine';
import { buildScriptedFallbackResponse } from '@/lib/chat/onboarding-script/respond';
import { SCRIPT_LINES } from '@/lib/chat/onboarding-script/script';

const GET_ARTIST_LINE = SCRIPT_LINES.find(line => line.stepId === 'get_artist');

function makeTurn(): FallbackTurn {
  if (!GET_ARTIST_LINE) throw new Error('missing get_artist line');
  return {
    line: GET_ARTIST_LINE,
    text: GET_ARTIST_LINE.text,
    toolEvents: [
      {
        toolName: 'searchSpotifyArtist',
        input: { query: 'test artist' },
        output: {
          action: 'open_artist_picker',
          query: 'test artist',
          summary: 'Pick the matching Spotify artist.',
        },
      },
    ],
  };
}

describe('buildScriptedFallbackResponse', () => {
  it('streams UIMessage chunks the onboarding client can render', async () => {
    const { response, persistedToolEvents } = buildScriptedFallbackResponse({
      turn: makeTurn(),
      reason: 'llm_error',
      headers: { 'x-request-id': 'req-1' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('x-onboarding-fallback')).toBe(
      GET_ARTIST_LINE?.key
    );
    expect(response.headers.get('x-fallback-reason')).toBe('llm_error');
    expect(response.headers.get('x-request-id')).toBe('req-1');

    const body = await response.text();
    const chunks = body
      .split('\n')
      .filter(chunkLine => chunkLine.startsWith('data: '))
      .map(chunkLine => chunkLine.slice('data: '.length))
      .filter(payload => payload !== '[DONE]')
      .map(payload => JSON.parse(payload) as Record<string, unknown>);

    const types = chunks.map(chunk => chunk.type);
    expect(types).toContain('start');
    expect(types).toContain('text-delta');
    expect(types).toContain('tool-input-available');
    expect(types).toContain('tool-output-available');
    expect(types).toContain('finish');

    const toolInput = chunks.find(
      chunk => chunk.type === 'tool-input-available'
    );
    const toolOutput = chunks.find(
      chunk => chunk.type === 'tool-output-available'
    );
    expect(toolInput?.toolName).toBe('searchSpotifyArtist');
    expect(toolInput?.toolCallId).toBeTruthy();
    expect(toolOutput?.toolCallId).toBe(toolInput?.toolCallId);
    expect(
      (toolOutput?.output as Record<string, unknown> | undefined)?.action
    ).toBe('open_artist_picker');

    const deltas = chunks
      .filter(chunk => chunk.type === 'text-delta')
      .map(chunk => chunk.delta)
      .join('');
    expect(deltas).toBe(GET_ARTIST_LINE?.text);

    // Persistence payload matches the v2 tool-event schema the claim flow reads.
    expect(persistedToolEvents).toHaveLength(1);
    expect(persistedToolEvents?.[0]).toMatchObject({
      schemaVersion: 2,
      toolName: 'searchSpotifyArtist',
      state: 'succeeded',
      uiHint: 'artifact',
    });
  });
});
