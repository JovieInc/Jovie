import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.ts';
import { MemoryLedgerStore } from './store.ts';

it('preserves FormData boundaries and file bytes through the shared client', async () => {
  const form = new FormData();
  form.set('file', new Blob(['audio']), 'dictation.wav');
  form.set('model_id', 'scribe_v2');
  const fetchProvider = vi.fn(
    async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.body).toBe(form);
      expect(new Headers(init?.headers).has('content-type')).toBe(false);
      return new Response(JSON.stringify({ text: 'Hello' }), {
        headers: { 'content-type': 'application/json' },
      });
    }
  );
  const client = createApiClient({
    provider: 'elevenlabs',
    credential: 'test',
    store: new MemoryLedgerStore(),
    fetch: fetchProvider,
    log: () => {},
  });
  const response = await client.request({
    url: 'https://api.elevenlabs.io/v1/speech-to-text',
    method: 'POST',
    body: form,
    maxAttempts: 1,
  });
  expect(response.json()).toEqual({ text: 'Hello' });
  expect(fetchProvider).toHaveBeenCalledOnce();
});
