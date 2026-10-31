import { CSRF_HEADER_NAME, getBrowserCsrfToken } from '@/lib/security/csrf';
import { DictationError } from './errors';
import { DICTATION_LIMITS } from './limits';
import type { DictationProvider } from './types';
import { BATCH_CHUNK_SECONDS, encodeWav, PCM_SAMPLE_RATE } from './wav';

export async function recordingToWavChunks(blob: Blob): Promise<Blob[]> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    if (decoded.duration > DICTATION_LIMITS.maxSessionSeconds + 1)
      throw new DictationError('dictation_cap_reached');
    const offline = new OfflineAudioContext(
      1,
      Math.ceil(decoded.duration * PCM_SAMPLE_RATE),
      PCM_SAMPLE_RATE
    );
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const mono = (await offline.startRendering()).getChannelData(0);
    const chunks: Blob[] = [];
    for (
      let offset = 0;
      offset < mono.length;
      offset += BATCH_CHUNK_SECONDS * PCM_SAMPLE_RATE
    )
      chunks.push(
        new Blob(
          [
            encodeWav(
              mono.subarray(
                offset,
                offset + BATCH_CHUNK_SECONDS * PCM_SAMPLE_RATE
              )
            ),
          ],
          { type: 'audio/wav' }
        )
      );
    return chunks;
  } finally {
    await context.close();
  }
}
export function createElevenLabsBatchProvider(
  options: { fetch?: typeof fetch; convert?: typeof recordingToWavChunks } = {}
): DictationProvider {
  return {
    id: 'elevenlabs-batch',
    capabilities: {
      streaming: false,
      partials: false,
      batch: true,
      languages: ['auto'],
      maxSessionSec: DICTATION_LIMITS.maxSessionSeconds,
      fullDuplexSafe: false,
      runsIn: ['web', 'electron'],
    },
    health: () =>
      typeof MediaRecorder !== 'undefined' &&
      typeof AudioContext !== 'undefined',
    async transcribe(blob, signal) {
      const chunks = await (options.convert ?? recordingToWavChunks)(blob);
      const transcripts: string[] = [];
      for (const chunk of chunks) {
        signal.throwIfAborted();
        const csrf = getBrowserCsrfToken();
        const response = await (options.fetch ?? fetch)(
          '/api/dictation/transcribe',
          {
            method: 'POST',
            body: chunk,
            signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]),
            credentials: 'same-origin',
            headers: {
              'Content-Type': 'audio/wav',
              ...(csrf ? { [CSRF_HEADER_NAME]: csrf } : {}),
            },
          }
        );
        const data = (await response.json()) as {
          text?: unknown;
          code?: string;
        };
        if (!response.ok)
          throw new DictationError(
            data.code === 'dictation_cap_reached' ||
              data.code === 'rate_limited'
              ? data.code
              : 'provider-down'
          );
        if (typeof data.text !== 'string')
          throw new DictationError('provider-down');
        transcripts.push(data.text);
      }
      return transcripts.join(' ');
    },
  };
}
