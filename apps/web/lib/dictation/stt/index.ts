import 'server-only';
import { env } from '@/lib/env-server';
import { cloudflareStt } from './cloudflare';
import { elevenLabsStt } from './elevenlabs';
import { clipCostUsd, type SttClip, type SttProvider } from './types';

export type { SttClip, SttProvider } from './types';

const REGISTRY: readonly SttProvider[] = [elevenLabsStt, cloudflareStt];
/** ElevenLabs first for now; Cloudflare is the fallback once its token exists. */
export const DEFAULT_ORDER = 'elevenlabs,cloudflare';

/** Providers to try, in order, from DICTATION_STT_PROVIDERS; unknown ids ignored. */
export function resolveSttProviders(
  config: string | undefined = env.DICTATION_STT_PROVIDERS,
  registry: readonly SttProvider[] = REGISTRY
): SttProvider[] {
  const ids = (config?.trim() || DEFAULT_ORDER).split(',').map(s => s.trim());
  return ids.flatMap(id => registry.filter(p => p.id === id && p.available()));
}

export class DictationUnavailableError extends Error {}

/** Estimate clip length when the client did not send one (~16 kB/s Opus). */
export function estimateDurationMs(bytes: number): number {
  return Math.round((bytes / 16_000) * 1000);
}

function logCall(event: Record<string, unknown>): void {
  process.stdout.write(
    `${JSON.stringify({ schema: 'jovie.dictation-stt/v1', ...event })}\n`
  );
}

/** Tries each configured provider in order; logs provider, cost and latency per attempt. */
export async function transcribeDictationClip(
  clip: SttClip,
  options: { providers?: readonly SttProvider[]; fetchImpl?: typeof fetch } = {}
): Promise<string> {
  const providers = options.providers ?? resolveSttProviders();
  if (providers.length === 0) {
    throw new DictationUnavailableError('no dictation STT provider configured');
  }
  let lastError: unknown;
  for (const provider of providers) {
    const startedAt = Date.now();
    try {
      const text = await provider.transcribe(clip, options.fetchImpl);
      logCall({
        provider: provider.id,
        ok: true,
        bytes: clip.audio.byteLength,
        durationMs: clip.durationMs,
        costUsd: Number(clipCostUsd(provider, clip).toFixed(6)),
        latencyMs: Date.now() - startedAt,
      });
      return text;
    } catch (error) {
      lastError = error;
      logCall({
        provider: provider.id,
        ok: false,
        bytes: clip.audio.byteLength,
        durationMs: clip.durationMs,
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  }
  throw lastError;
}
