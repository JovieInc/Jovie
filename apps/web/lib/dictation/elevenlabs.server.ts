import 'server-only';
import { createApiClient } from '@jovie/api-client';
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
    url: 'https://api.elevenlabs.io/v1/single-use-token/realtime_scribe',
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
