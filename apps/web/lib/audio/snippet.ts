export const AUDIO_SNIPPET_METADATA_KEY = 'audioSnippet';

export type AudioSnippet = {
  readonly startMs: number;
  readonly endMs: number;
  readonly updatedAt?: string;
};

export const MIN_SNIPPET_DURATION_MS = 1_000;
export const MAX_SNIPPET_DURATION_MS = 60_000;
export const DEFAULT_SNIPPET_DURATION_MS = 30_000;

export function parseAudioSnippet(
  metadata: Record<string, unknown> | null | undefined
): AudioSnippet | null {
  const raw = metadata?.[AUDIO_SNIPPET_METADATA_KEY];
  if (!raw || typeof raw !== 'object') return null;

  const candidate = raw as {
    startMs?: unknown;
    endMs?: unknown;
    updatedAt?: unknown;
  };

  if (
    typeof candidate.startMs !== 'number' ||
    typeof candidate.endMs !== 'number' ||
    !Number.isFinite(candidate.startMs) ||
    !Number.isFinite(candidate.endMs)
  ) {
    return null;
  }

  return {
    startMs: Math.max(0, Math.floor(candidate.startMs)),
    endMs: Math.max(0, Math.floor(candidate.endMs)),
    updatedAt:
      typeof candidate.updatedAt === 'string' ? candidate.updatedAt : undefined,
  };
}

export function createDefaultSnippet(durationMs: number): AudioSnippet {
  const safeDuration = Math.max(durationMs, MIN_SNIPPET_DURATION_MS);
  const span = Math.min(DEFAULT_SNIPPET_DURATION_MS, safeDuration);
  const startMs = Math.max(0, Math.floor((safeDuration - span) / 2));

  return {
    startMs,
    endMs: Math.min(safeDuration, startMs + span),
  };
}

export function normalizeSnippet(
  snippet: AudioSnippet,
  durationMs: number | null | undefined
): AudioSnippet | null {
  const maxDuration = durationMs ?? snippet.endMs;
  if (maxDuration <= 0) return null;

  const startMs = Math.max(
    0,
    Math.min(snippet.startMs, maxDuration - MIN_SNIPPET_DURATION_MS)
  );
  let endMs = Math.max(startMs + MIN_SNIPPET_DURATION_MS, snippet.endMs);
  endMs = Math.min(endMs, maxDuration);

  if (endMs - startMs < MIN_SNIPPET_DURATION_MS) return null;
  if (endMs - startMs > MAX_SNIPPET_DURATION_MS) {
    endMs = startMs + MAX_SNIPPET_DURATION_MS;
  }

  return { startMs: Math.floor(startMs), endMs: Math.floor(endMs) };
}

export function formatSnippetRange(startMs: number, endMs: number): string {
  const format = (ms: number) => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return `${format(startMs)} – ${format(endMs)}`;
}
