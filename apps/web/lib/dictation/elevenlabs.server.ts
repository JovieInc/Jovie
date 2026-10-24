import 'server-only';
import { createApiClient } from '@jovie/api-client';
import apiProviders from '@jovie/api-client/providers.json';
import { env } from '@/lib/env-server';

/** No raw provider errors, headers, credentials or token bodies reach logs. */
export async function mintDictationToken(): Promise<string> {
  if (!env.ELEVENLABS_API_KEY) throw new Error('provider-down');
  const client = createApiClient({
    provider: 'elevenlabs',
    credential: 'dictation-server',
    authorize: headers => {
      headers.set('xi-api-key', env.ELEVENLABS_API_KEY ?? '');
    },
    log: () => {},
  });
  const response = await client.request({
    url: new URL(
      '/v1/single-use-token/realtime_scribe',
      `https://${apiProviders.providers.elevenlabs.hosts[0]}`
    ).href,
    method: 'POST',
    timeoutMs: 8000,
    maxAttempts: 1,
    maxWaitMs: 0,
    coalesce: false,
    conditional: false,
  });
  if (response.status !== 200) throw new Error('provider-down');
  const data = response.json<{ token?: unknown }>();
  if (typeof data.token !== 'string' || !data.token) throw new Error('token');
  return data.token;
}

/** WAV duration is validated by the route before any paid request is made. */
export async function transcribeDictationAudio(
  audio: ArrayBuffer,
  signal: AbortSignal
): Promise<string> {
  if (!env.ELEVENLABS_API_KEY) throw new Error('provider-down');
  const client = createApiClient({
    provider: 'elevenlabs',
    credential: 'dictation-server',
    authorize: headers => {
      headers.set('xi-api-key', env.ELEVENLABS_API_KEY ?? '');
    },
    log: () => {},
  });
  const form = new FormData();
  form.set('file', new Blob([audio], { type: 'audio/wav' }), 'dictation.wav');
  form.set('model_id', 'scribe_v2');
  form.set('tag_audio_events', 'false');
  form.set('timestamps_granularity', 'none');
  const response = await client.request({
    url: new URL(
      '/v1/speech-to-text',
      `https://${apiProviders.providers.elevenlabs.hosts[0]}`
    ).href,
    method: 'POST',
    body: form,
    timeoutMs: 55000,
    maxAttempts: 1,
    maxWaitMs: 0,
    coalesce: false,
    conditional: false,
    signal,
  });
  if (response.status !== 200) throw new Error('provider-down');
  const data = response.json<{ text?: unknown }>();
  if (typeof data.text !== 'string') throw new Error('provider-down');
  return data.text;
}
