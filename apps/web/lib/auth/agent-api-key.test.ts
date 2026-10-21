import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authenticateAgentApiKey } from './agent-api-key';

const mocks = vi.hoisted(() => ({ verify: vi.fn(), rows: vi.fn() }));
vi.mock('./better-auth', () => ({
  auth: { api: { verifyApiKey: mocks.verify } },
}));
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: mocks.rows }) }) }),
  },
}));
const token = 'jovie_' + 'x'.repeat(64);
const request = (authorization?: string) =>
  new Request('https://jov.ie/api/agents/profiles', {
    headers: authorization === undefined ? {} : { authorization },
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verify.mockResolvedValue({
    valid: true,
    key: { referenceId: 'ba-user' },
  });
  mocks.rows.mockResolvedValue([{ id: 'app-user' }]);
});

describe('agent API key identity', () => {
  it('keeps anonymous traffic DB-free and rejects malformed credentials', async () => {
    expect(await authenticateAgentApiKey(request())).toEqual({
      ok: true,
      userId: null,
    });
    for (const value of [
      '',
      'Basic invalid',
      'Bearer short',
      'Bearer jovie_bad',
    ]) {
      expect(await authenticateAgentApiKey(request(value))).toEqual({
        ok: false,
      });
    }
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it('resolves the application account from the verified provider owner', async () => {
    expect(await authenticateAgentApiKey(request(`Bearer ${token}`))).toEqual({
      ok: true,
      userId: 'app-user',
    });
    expect(mocks.verify).toHaveBeenCalledWith({ body: { key: token } });
  });
  it('rejects revoked keys and missing or disabled application identities', async () => {
    mocks.verify.mockResolvedValueOnce({ valid: false, key: null });
    expect(await authenticateAgentApiKey(request(`Bearer ${token}`))).toEqual({
      ok: false,
    });
    expect(mocks.rows).not.toHaveBeenCalled();
    mocks.rows.mockResolvedValue([]);
    expect(await authenticateAgentApiKey(request(`Bearer ${token}`))).toEqual({
      ok: false,
    });
  });
  it('propagates provider failures instead of silently downgrading to anonymous', async () => {
    mocks.verify.mockRejectedValue(new Error('database unavailable'));
    await expect(
      authenticateAgentApiKey(request(`Bearer ${token}`))
    ).rejects.toThrow('database unavailable');
  });
});
