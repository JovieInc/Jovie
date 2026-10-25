import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: {
    ELEVENLABS_API_KEY: 'k',
    ELEVENLABS_SUMMER_AGENT_ID: 'agent_1',
  } as Record<string, string | undefined>,
  boundedFetch: vi.fn(),
  fetchSummerShadow: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/env-server', () => ({ env: mocks.env }));
vi.mock('@/lib/http/bounded-fetch', () => ({
  boundedFetch: mocks.boundedFetch,
}));
vi.mock('@/lib/ovie/summer-shadow-client', () => ({
  fetchSummerShadow: mocks.fetchSummerShadow,
}));

import {
  askSummerForVoice,
  createSummerVoiceSession,
  SUMMER_VOICE_AGENT_TOOL,
} from './summer-voice';

const sse = (frames: [string, object][]) =>
  new Response(
    frames
      .map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`)
      .join('')
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.env.ELEVENLABS_API_KEY = 'k';
  mocks.env.ELEVENLABS_SUMMER_AGENT_ID = 'agent_1';
});

describe('createSummerVoiceSession', () => {
  it('fails closed when the key or agent id is missing', async () => {
    mocks.env.ELEVENLABS_SUMMER_AGENT_ID = undefined;
    expect(await createSummerVoiceSession()).toEqual({
      ok: false,
      code: 'voice_not_configured',
    });
    expect(mocks.boundedFetch).not.toHaveBeenCalled();
  });

  it('returns a signed wss URL and never the API key', async () => {
    mocks.boundedFetch.mockResolvedValue(
      Response.json({
        signed_url:
          'wss://api.elevenlabs.io/v1/convai/conversation?agent_id=agent_1&conversation_signature=s',
      })
    );
    const session = await createSummerVoiceSession();
    expect(session.ok).toBe(true);
    expect(JSON.stringify(session)).not.toContain('"k"');
    expect(mocks.boundedFetch.mock.calls[0]?.[1]?.headers).toEqual({
      'xi-api-key': 'k',
    });
  });

  it('rejects non-wss and provider errors', async () => {
    mocks.boundedFetch.mockResolvedValueOnce(
      Response.json({ signed_url: 'https://evil.test' })
    );
    expect(await createSummerVoiceSession()).toEqual({
      ok: false,
      code: 'voice_provider_unavailable',
    });
    mocks.boundedFetch.mockResolvedValueOnce(
      new Response('x', { status: 500 })
    );
    expect(await createSummerVoiceSession()).toEqual({
      ok: false,
      code: 'voice_provider_unavailable',
    });
  });
});

describe('askSummerForVoice', () => {
  it('joins deltas and reports ttft and total', async () => {
    let t = 0;
    mocks.fetchSummerShadow.mockResolvedValue(
      sse([
        ['delta', { text: 'Queue ' }],
        ['delta', { text: 'is clear.' }],
        ['done', {}],
      ])
    );
    const answer = await askSummerForVoice({
      question: 'q',
      principalHash: 'p',
      now: () => (t += 100),
    });
    expect(answer).toEqual({
      ok: true,
      text: 'Queue is clear.',
      ttftMs: 100,
      totalMs: 200,
    });
    const body = JSON.parse(mocks.fetchSummerShadow.mock.calls[0]?.[1]?.body);
    expect(body.mode).toBe('voice');
  });

  it('reports unavailable on stream error, empty answer, or transport failure', async () => {
    mocks.fetchSummerShadow.mockResolvedValueOnce(
      sse([['error', { code: 'x' }]])
    );
    expect(
      (await askSummerForVoice({ question: 'q', principalHash: 'p' })).ok
    ).toBe(false);
    mocks.fetchSummerShadow.mockResolvedValueOnce(sse([['done', {}]]));
    expect(
      (await askSummerForVoice({ question: 'q', principalHash: 'p' })).ok
    ).toBe(false);
    mocks.fetchSummerShadow.mockRejectedValueOnce(new Error('net'));
    expect(
      (await askSummerForVoice({ question: 'q', principalHash: 'p' })).ok
    ).toBe(false);
  });
});

describe('agent tool definition', () => {
  it('is a client tool the browser runs with the founder session', () => {
    expect(SUMMER_VOICE_AGENT_TOOL.type).toBe('client');
    expect(SUMMER_VOICE_AGENT_TOOL.name).toBe('ask_summer');
  });
});
