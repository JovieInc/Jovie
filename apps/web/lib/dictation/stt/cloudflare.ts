import 'server-only';
import { createApiClient, hashCredential } from '@jovie/api-client';
import { env } from '@/lib/env-server';
import { clipCostUsd, type SttProvider } from './types';

/** Workers AI Whisper large-v3-turbo: ~$0.0005 per audio minute (list price). */
export const CLOUDFLARE_STT_MODEL = '@cf/openai/whisper-large-v3-turbo';

export const cloudflareStt: SttProvider = {
  id: 'cloudflare',
  perMinuteUsd: 0.0005,
  available: () =>
    Boolean(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_WORKERS_AI_TOKEN),
  async transcribe(clip, fetchImpl) {
    const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
    const token = env.CLOUDFLARE_WORKERS_AI_TOKEN?.trim();
    if (!accountId || !token) throw new Error('cloudflare stt not configured');
    const client = createApiClient({
      provider: 'cloudflare',
      credential: hashCredential('jovie-web:dictation', token),
      authorize: headers => headers.set('authorization', `Bearer ${token}`),
      dailySpendCapUsd: 5,
      fetch: fetchImpl,
      log: () => undefined,
    });
    const response = await client.request({
      url: `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${CLOUDFLARE_STT_MODEL}`,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: { audio: Buffer.from(clip.audio).toString('base64') },
      priority: 'default',
      write: false,
      priceUsd: Math.max(clipCostUsd(this, clip), 0.000001),
      maxAttempts: 2,
      timeoutMs: 20_000,
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`cloudflare stt ${response.status}`);
    }
    const data = response.json<{ result?: { text?: unknown } }>();
    return typeof data.result?.text === 'string' ? data.result.text.trim() : '';
  },
};
