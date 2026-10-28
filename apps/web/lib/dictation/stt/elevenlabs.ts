import 'server-only';
import { createApiClient, hashCredential } from '@jovie/api-client';
import { env } from '@/lib/env-server';
import { clipCostUsd, type SttProvider } from './types';

export const ELEVENLABS_STT_MODEL = 'scribe_v1';

/** Scribe: ~$0.40 per audio hour (list price; we spend credits). */
export const elevenLabsStt: SttProvider = {
  id: 'elevenlabs',
  perMinuteUsd: 0.4 / 60,
  available: () => Boolean(env.ELEVENLABS_API_KEY?.trim()),
  async transcribe(clip, fetchImpl) {
    const apiKey = env.ELEVENLABS_API_KEY?.trim();
    if (!apiKey) throw new Error('elevenlabs stt not configured');
    const client = createApiClient({
      provider: 'elevenlabs',
      credential: hashCredential('jovie-web:dictation', apiKey),
      authorize: headers => headers.set('xi-api-key', apiKey),
      fetch: fetchImpl,
      log: () => undefined,
    });
    const form = new FormData();
    form.set('model_id', ELEVENLABS_STT_MODEL);
    form.set('tag_audio_events', 'false');
    form.set(
      'file',
      new Blob([clip.audio as BlobPart], { type: clip.mimeType }),
      'dictation.webm'
    );
    const response = await client.request({
      url: 'https://api.elevenlabs.io/v1/speech-to-text',
      method: 'POST',
      body: form,
      priority: 'default',
      write: false,
      priceUsd: Math.max(clipCostUsd(this, clip), 0.000001),
      maxAttempts: 2,
      timeoutMs: 20_000,
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`elevenlabs stt ${response.status}`);
    }
    const data = response.json<{ text?: unknown }>();
    return typeof data.text === 'string' ? data.text.trim() : '';
  },
};
