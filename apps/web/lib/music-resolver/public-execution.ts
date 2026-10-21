import 'server-only';

import { captureError } from '@/lib/error-tracking';

// Below the routes' 60-second platform budget, including provider retries.
export const MUSIC_READ_TIMEOUT_MS = 45_000;

/** One deadline, cancellation and failure policy for public REST and MCP reads. */
export async function executePublicMusicRead(
  operation: (signal: AbortSignal) => Promise<Record<string, unknown>>,
  ...signals: (AbortSignal | undefined)[]
): Promise<Record<string, unknown>> {
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), MUSIC_READ_TIMEOUT_MS);
  const signal = AbortSignal.any([
    deadline.signal,
    ...signals.filter((value): value is AbortSignal => value !== undefined),
  ]);
  let onAbort: (() => void) | undefined;
  try {
    const stopped = new Promise<Record<string, unknown>>(resolve => {
      onAbort = () =>
        resolve({
          error: {
            code: deadline.signal.aborted ? 'UPSTREAM_TIMEOUT' : 'CANCELLED',
            retryable: deadline.signal.aborted,
          },
        });
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
    if (signal.aborted) return await stopped;
    const result = await Promise.race([operation(signal), stopped]);
    // Provider cancellation may settle before the race listener.
    return signal.aborted ? await stopped : result;
  } catch {
    if (signal.aborted) {
      return {
        error: {
          code: deadline.signal.aborted ? 'UPSTREAM_TIMEOUT' : 'CANCELLED',
          retryable: deadline.signal.aborted,
        },
      };
    }
    // Provider facts and caller arguments never enter telemetry.
    await captureError(
      'Public music read failed',
      new Error('Public music read failure')
    );
    return { error: { code: 'UPSTREAM_FAILURE', retryable: true } };
  } finally {
    clearTimeout(timer);
    if (onAbort) signal.removeEventListener('abort', onAbort);
  }
}
