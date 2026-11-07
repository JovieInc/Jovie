import { beforeEach, describe, expect, it, vi } from 'vitest';

const { request, createClient, env } = vi.hoisted(() => ({
  request: vi.fn(),
  createClient: vi.fn(),
  env: { ELEVENLABS_API_KEY: 'unit-test-placeholder' },
}));
vi.mock('server-only', () => ({}));
vi.mock('@jovie/api-client', () => ({ createApiClient: createClient }));
vi.mock('@/lib/env-server', () => ({ env }));

import { mintDictationToken } from './elevenlabs.server';

beforeEach(() => {
  vi.resetAllMocks();
  env.ELEVENLABS_API_KEY = 'unit-test-placeholder';
  createClient.mockReturnValue({ request });
  request.mockResolvedValue({
    status: 200,
    json: () => ({ token: 'single-use-fixture' }),
  });
});
describe('server token minting', () => {
  it('sends the key only in the server-side auth header with bounded non-idempotent HTTP', async () => {
    expect(await mintDictationToken()).toBe('single-use-fixture');
    const config = createClient.mock.calls[0][0];
    const headers = new Headers();
    config.authorize(headers);
    expect(headers.get('xi-api-key')).toBe(env.ELEVENLABS_API_KEY);
    expect(config.credential).toBe('dictation-server');
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: 'https://api.elevenlabs.io/v1/single-use-token/realtime_scribe',
        maxAttempts: 1,
        timeoutMs: 8000,
        coalesce: false,
      })
    );
  });
  it('fails safely when the key is absent or response is malformed', async () => {
    env.ELEVENLABS_API_KEY = '';
    await expect(mintDictationToken()).rejects.toThrow('provider-down');
    expect(request).not.toHaveBeenCalled();
    env.ELEVENLABS_API_KEY = 'unit-test-placeholder';
    request.mockResolvedValue({ status: 200, json: () => ({}) });
    await expect(mintDictationToken()).rejects.toThrow('token');
    request.mockResolvedValue({ status: 429, json: () => ({}) });
    await expect(mintDictationToken()).rejects.toThrow('provider-down');
  });
});
