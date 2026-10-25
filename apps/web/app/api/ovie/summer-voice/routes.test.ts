import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  gate: vi.fn(),
  createSession: vi.fn(),
  ask: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/ovie/summer-founder-gate', () => ({
  requireFounderPrincipal: mocks.gate,
  SUMMER_NO_STORE_HEADERS: { 'Cache-Control': 'private, no-store' },
}));
vi.mock('@/lib/ovie/summer-voice', () => ({
  createSummerVoiceSession: mocks.createSession,
  askSummerForVoice: mocks.ask,
}));

import { POST as ask } from './ask/route';
import { POST as session } from './session/route';

const denied = () =>
  NextResponse.json({ error: 'founder_required' }, { status: 403 });
const post = (body: unknown) =>
  new Request('http://x/api/ovie/summer-voice/ask', {
    method: 'POST',
    body: JSON.stringify(body),
  });

beforeEach(() => vi.clearAllMocks());

describe('summer voice routes', () => {
  it('session: denies non-founders before touching the provider', async () => {
    mocks.gate.mockResolvedValue(denied());
    expect((await session()).status).toBe(403);
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it('session: 503 when voice is not configured, 200 with the signed URL otherwise', async () => {
    mocks.gate.mockResolvedValue({ principalHash: 'p' });
    mocks.createSession.mockResolvedValueOnce({
      ok: false,
      code: 'voice_not_configured',
    });
    expect((await session()).status).toBe(503);
    mocks.createSession.mockResolvedValueOnce({
      ok: true,
      provider: 'elevenlabs',
      signedUrl: 'wss://x',
      firstMessage: 'hi',
    });
    const response = await session();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('ask: validates the question and passes the founder principal', async () => {
    mocks.gate.mockResolvedValue({ principalHash: 'p' });
    expect((await ask(post({ question: '' }))).status).toBe(400);
    expect((await ask(post({ question: 'x', extra: 1 }))).status).toBe(400);
    mocks.ask.mockResolvedValue({
      ok: true,
      text: 'fine',
      ttftMs: 1,
      totalMs: 2,
    });
    const response = await ask(post({ question: 'how is shipping' }));
    expect(response.status).toBe(200);
    expect(mocks.ask.mock.calls[0]?.[0]).toMatchObject({
      question: 'how is shipping',
      principalHash: 'p',
    });
  });

  it('ask: 503 when Summer is unavailable, denies non-founders', async () => {
    mocks.gate.mockResolvedValueOnce({ principalHash: 'p' });
    mocks.ask.mockResolvedValue({ ok: false, code: 'summer_unavailable' });
    expect((await ask(post({ question: 'q' }))).status).toBe(503);
    mocks.gate.mockResolvedValueOnce(denied());
    expect((await ask(post({ question: 'q' }))).status).toBe(403);
  });
});
