export interface InteractionLatencyMarkHandle {
  readonly id: string;
  readonly name: string;
  readonly startMark: string;
}

export const UX_LATENCY_STORAGE_KEY = 'jovie:ux-latency:v1';
export const UX_LATENCY_EVENT_NAME = 'jovie:ux-latency';
export const UX_LATENCY_MAX_SAMPLES_PER_METRIC = 50;
export const UX_LATENCY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const UX_LATENCY_MAX_DURATION_MS = 120_000;

export const UX_LATENCY_METRICS = [
  { name: 'chat_first_token', label: 'Chat First Token' },
  { name: 'chat_send_round_trip', label: 'Chat Send RTT' },
  { name: 'speech_to_text', label: 'Speech To Text' },
  { name: 'page_to_interactive', label: 'Page Interactive' },
  { name: 'gbrain_query', label: 'Gbrain Query' },
] as const;

export type UxLatencyMetric = (typeof UX_LATENCY_METRICS)[number]['name'];

export interface UxLatencySample {
  readonly durationMs: number;
  readonly recordedAt: number;
}

export interface UxLatencySummary {
  readonly metric: UxLatencyMetric;
  readonly label: string;
  readonly sampleCount: number;
  readonly p50Ms: number | null;
  readonly p95Ms: number | null;
}

type UxLatencyStore = {
  readonly version: 1;
  readonly samples: Partial<
    Record<UxLatencyMetric, readonly UxLatencySample[]>
  >;
};

const UX_LATENCY_METRIC_NAMES = new Set<UxLatencyMetric>(
  UX_LATENCY_METRICS.map(metric => metric.name)
);

let fallbackInteractionIdCounter = 0;

function canUsePerformanceMarks() {
  return (
    typeof performance !== 'undefined' &&
    typeof performance.mark === 'function' &&
    typeof performance.measure === 'function'
  );
}

function createInteractionId(name: string) {
  const suffix =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${(fallbackInteractionIdCounter += 1)}`;

  return `${name}:${suffix}`;
}

function canUseLatencyStorage(): boolean {
  return (
    typeof globalThis.window !== 'undefined' &&
    typeof globalThis.localStorage !== 'undefined'
  );
}

function isUxLatencyMetric(value: unknown): value is UxLatencyMetric {
  return (
    typeof value === 'string' &&
    UX_LATENCY_METRIC_NAMES.has(value as UxLatencyMetric)
  );
}

function isValidSample(value: unknown): value is UxLatencySample {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.durationMs === 'number' &&
    Number.isFinite(candidate.durationMs) &&
    candidate.durationMs >= 0 &&
    candidate.durationMs <= UX_LATENCY_MAX_DURATION_MS &&
    typeof candidate.recordedAt === 'number' &&
    Number.isFinite(candidate.recordedAt)
  );
}

function emptyUxLatencyStore(): UxLatencyStore {
  return { version: 1, samples: {} };
}

function readUxLatencyStore(now = Date.now()): UxLatencyStore {
  if (!canUseLatencyStorage()) return emptyUxLatencyStore();

  try {
    const raw = globalThis.localStorage.getItem(UX_LATENCY_STORAGE_KEY);
    if (!raw) return emptyUxLatencyStore();
    const parsed = JSON.parse(raw) as {
      version?: unknown;
      samples?: unknown;
    };
    if (
      parsed.version !== 1 ||
      typeof parsed.samples !== 'object' ||
      parsed.samples === null
    ) {
      return emptyUxLatencyStore();
    }

    const samples: UxLatencyStore['samples'] = {};
    for (const metric of UX_LATENCY_METRICS) {
      const candidate = (parsed.samples as Record<string, unknown>)[
        metric.name
      ];
      if (!Array.isArray(candidate)) continue;
      samples[metric.name] = candidate
        .filter(isValidSample)
        .filter(sample => now - sample.recordedAt <= UX_LATENCY_RETENTION_MS)
        .slice(-UX_LATENCY_MAX_SAMPLES_PER_METRIC);
    }
    return { version: 1, samples };
  } catch {
    return emptyUxLatencyStore();
  }
}

function writeUxLatencyStore(store: UxLatencyStore): boolean {
  if (!canUseLatencyStorage()) return false;
  try {
    globalThis.localStorage.setItem(
      UX_LATENCY_STORAGE_KEY,
      JSON.stringify(store)
    );
    return true;
  } catch {
    return false;
  }
}

function percentile(
  samples: readonly UxLatencySample[],
  quantile: number
): number | null {
  if (samples.length === 0) return null;
  const sorted = samples
    .map(sample => sample.durationMs)
    .sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * quantile) - 1);
  return sorted[index] ?? null;
}

/**
 * Stores one privacy-safe duration locally. The fixed metric allowlist and
 * duration-only payload make it impossible to attach message text, routes,
 * user identifiers, or arbitrary dimensions.
 */
export function recordUxLatency(
  metric: UxLatencyMetric,
  durationMs: number,
  recordedAt = Date.now()
): boolean {
  if (
    !isUxLatencyMetric(metric) ||
    !Number.isFinite(durationMs) ||
    durationMs < 0 ||
    durationMs > UX_LATENCY_MAX_DURATION_MS ||
    !Number.isFinite(recordedAt)
  ) {
    return false;
  }

  const store = readUxLatencyStore(recordedAt);
  const existing = store.samples[metric] ?? [];
  const samples = {
    ...store.samples,
    [metric]: [...existing, { durationMs, recordedAt }].slice(
      -UX_LATENCY_MAX_SAMPLES_PER_METRIC
    ),
  };
  if (!writeUxLatencyStore({ version: 1, samples })) return false;

  globalThis.dispatchEvent?.(new Event(UX_LATENCY_EVENT_NAME));
  return true;
}

export function getUxLatencySummaries(
  now = Date.now()
): readonly UxLatencySummary[] {
  const store = readUxLatencyStore(now);
  return UX_LATENCY_METRICS.map(metric => {
    const samples = store.samples[metric.name] ?? [];
    return {
      metric: metric.name,
      label: metric.label,
      sampleCount: samples.length,
      p50Ms: percentile(samples, 0.5),
      p95Ms: percentile(samples, 0.95),
    };
  });
}

export function subscribeUxLatency(listener: () => void): () => void {
  if (typeof globalThis.window === 'undefined') return () => {};
  const handleStorage = (event: StorageEvent) => {
    if (event.key === UX_LATENCY_STORAGE_KEY) listener();
  };
  globalThis.addEventListener(UX_LATENCY_EVENT_NAME, listener);
  globalThis.addEventListener('storage', handleStorage);
  return () => {
    globalThis.removeEventListener(UX_LATENCY_EVENT_NAME, listener);
    globalThis.removeEventListener('storage', handleStorage);
  };
}

export function resetUxLatencyForTests(): void {
  if (!canUseLatencyStorage()) return;
  globalThis.localStorage.removeItem(UX_LATENCY_STORAGE_KEY);
}

export function markInteractionStart(
  name: string
): InteractionLatencyMarkHandle | null {
  if (!canUsePerformanceMarks()) {
    return null;
  }

  const id = createInteractionId(name);
  const startMark = `${id}:start`;
  performance.mark(startMark);

  return {
    id,
    name,
    startMark,
  };
}

export function measureInteractionPoint(
  handle: InteractionLatencyMarkHandle | null,
  point: string
) {
  if (!handle || !canUsePerformanceMarks()) {
    return null;
  }

  const markName = `${handle.id}:${point}`;
  const measureName = `${handle.name}:event-to-${point}`;
  performance.mark(markName);
  performance.measure(measureName, handle.startMark, markName);
  return measureName;
}

export function measureInteractionNextPaint(
  handle: InteractionLatencyMarkHandle | null,
  point = 'first-paint'
) {
  if (!handle || typeof requestAnimationFrame !== 'function') {
    return Promise.resolve(null);
  }

  return new Promise<string | null>(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve(measureInteractionPoint(handle, point));
      });
    });
  });
}
