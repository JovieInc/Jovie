import { beforeEach, describe, expect, it, vi } from 'vitest';

const { auth, mint, cap, limit } = vi.hoisted(() => ({
  auth: vi.fn(),
  mint: vi.fn(),
  cap: vi.fn(),
  limit: vi.fn(),
}));
vi.mock('@/lib/auth/cached', () => ({ getOptionalAuth: auth }));
vi.mock('@/lib/dictation/elevenlabs.server', () => ({
  mintDictationToken: mint,
}));
vi.mock('@/lib/dictation/quota.server', () => ({
  reserveDictationAudio: cap,
  checkDictationMintLimit: limit,
}));

import { POST } from './route';

beforeEach(() => {
  vi.resetAllMocks();
  auth.mockResolvedValue({ userId: 'account' });
  mint.mockResolvedValue('single-use-fixture');
  cap.mockResolvedValue(null);
  limit.mockResolvedValue(null);
});
describe('dictation token route', () => {
  it('requires auth before consuming caps or minting', async () => {
    auth.mockResolvedValue({ userId: null });
    expect((await POST()).status).toBe(401);
    expect(cap).not.toHaveBeenCalled();
    expect(mint).not.toHaveBeenCalled();
  });
  it('returns only a single-use token and public connection settings', async () => {
    const response = await POST();
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const data = await response.json();
    expect(data).toEqual({
      provider: 'elevenlabs-stream',
      token: 'single-use-fixture',
      expiresAt: expect.any(Number),
      wsUrl: 'wss://api.elevenlabs.io/v1/speech-to-text/realtime',
      modelId: 'scribe_v2_realtime',
      maxSessionSec: 600,
    });
    expect(cap).toHaveBeenCalledWith('account', 600);
    expect(Object.keys(data).sort()).toEqual([
      'expiresAt',
      'maxSessionSec',
      'modelId',
      'provider',
      'token',
      'wsUrl',
    ]);
  });
  it.each(['rate_limited', 'provider-down'])(
    'rejects mint limit %s',
    async code => {
      limit.mockResolvedValue(code);
      const response = await POST();
      expect(response.status).toBe(code === 'rate_limited' ? 429 : 503);
      expect(await response.json()).toEqual({ code });
      expect(mint).not.toHaveBeenCalled();
    }
  );
  it.each(['dictation_cap_reached', 'provider-down'])(
    'rejects audio limit %s',
    async code => {
      cap.mockResolvedValue(code);
      const response = await POST();
      expect(response.status).toBe(
        code === 'dictation_cap_reached' ? 429 : 503
      );
      expect(await response.json()).toEqual({ code });
      expect(mint).not.toHaveBeenCalled();
    }
  );
  it('never returns provider error bodies or secrets', async () => {
    mint.mockRejectedValue(new Error('private provider error'));
    const response = await POST();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: 'provider-down' });
  });
});
