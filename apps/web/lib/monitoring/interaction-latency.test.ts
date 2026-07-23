import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getUxLatencySummaries,
  markInteractionStart,
  measureInteractionNextPaint,
  measureInteractionPoint,
  recordUxLatency,
  resetUxLatencyForTests,
  subscribeUxLatency,
  UX_LATENCY_EVENT_NAME,
  UX_LATENCY_MAX_DURATION_MS,
  UX_LATENCY_MAX_SAMPLES_PER_METRIC,
  UX_LATENCY_RETENTION_MS,
  UX_LATENCY_STORAGE_KEY,
} from './interaction-latency';

function summary(metric: string) {
  const result = getUxLatencySummaries().find(
    candidate => candidate.metric === metric
  );
  expect(result).toBeDefined();
  return result!;
}

describe('UX latency telemetry', () => {
  beforeEach(() => {
    resetUxLatencyForTests();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stores only the allowlisted metric, duration, and timestamp', () => {
    expect(recordUxLatency('chat_first_token', 125, 1_000)).toBe(true);

    expect(
      JSON.parse(localStorage.getItem(UX_LATENCY_STORAGE_KEY) ?? '')
    ).toEqual({
      version: 1,
      samples: {
        chat_first_token: [{ durationMs: 125, recordedAt: 1_000 }],
      },
    });
  });

  it('rejects arbitrary metric names and invalid durations', () => {
    expect(
      recordUxLatency('private_message_text' as 'chat_first_token', 100, 1_000)
    ).toBe(false);
    expect(recordUxLatency('chat_first_token', Number.NaN, 1_000)).toBe(false);
    expect(recordUxLatency('chat_first_token', Number.POSITIVE_INFINITY)).toBe(
      false
    );
    expect(recordUxLatency('chat_first_token', -1, 1_000)).toBe(false);
    expect(
      recordUxLatency('chat_first_token', UX_LATENCY_MAX_DURATION_MS + 1, 1_000)
    ).toBe(false);
    expect(
      recordUxLatency('chat_first_token', 100, Number.POSITIVE_INFINITY)
    ).toBe(false);
    expect(localStorage.getItem(UX_LATENCY_STORAGE_KEY)).toBeNull();
  });

  it('calculates nearest-rank P50 and P95 summaries', () => {
    for (const duration of [50, 100, 150, 200, 1_000]) {
      recordUxLatency('chat_send_round_trip', duration, Date.now());
    }

    expect(summary('chat_send_round_trip')).toEqual({
      metric: 'chat_send_round_trip',
      label: 'Chat Send RTT',
      sampleCount: 5,
      p50Ms: 150,
      p95Ms: 1_000,
    });
  });

  it('returns stable empty summaries for every required experience', () => {
    expect(getUxLatencySummaries()).toEqual([
      {
        metric: 'chat_first_token',
        label: 'Chat First Token',
        sampleCount: 0,
        p50Ms: null,
        p95Ms: null,
      },
      {
        metric: 'chat_send_round_trip',
        label: 'Chat Send RTT',
        sampleCount: 0,
        p50Ms: null,
        p95Ms: null,
      },
      {
        metric: 'speech_to_text',
        label: 'Speech To Text',
        sampleCount: 0,
        p50Ms: null,
        p95Ms: null,
      },
      {
        metric: 'page_to_interactive',
        label: 'Page Interactive',
        sampleCount: 0,
        p50Ms: null,
        p95Ms: null,
      },
      {
        metric: 'gbrain_query',
        label: 'Gbrain Query',
        sampleCount: 0,
        p50Ms: null,
        p95Ms: null,
      },
    ]);
  });

  it('caps each metric to the newest bounded sample window', () => {
    for (
      let index = 0;
      index < UX_LATENCY_MAX_SAMPLES_PER_METRIC + 3;
      index += 1
    ) {
      recordUxLatency('speech_to_text', index, Date.now());
    }

    const stored = JSON.parse(
      localStorage.getItem(UX_LATENCY_STORAGE_KEY) ?? ''
    );
    expect(stored.samples.speech_to_text).toHaveLength(
      UX_LATENCY_MAX_SAMPLES_PER_METRIC
    );
    expect(stored.samples.speech_to_text[0].durationMs).toBe(3);
  });

  it('expires stale samples and ignores malformed storage', () => {
    const now = Date.now();
    localStorage.setItem(
      UX_LATENCY_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        samples: {
          page_to_interactive: [
            null,
            'not-a-sample',
            {
              durationMs: 200,
              recordedAt: now - UX_LATENCY_RETENTION_MS - 1,
            },
            { durationMs: 300, recordedAt: now },
            { durationMs: 'private-value', recordedAt: now },
          ],
        },
      })
    );
    expect(summary('page_to_interactive').sampleCount).toBe(1);

    localStorage.setItem(UX_LATENCY_STORAGE_KEY, '{not-json');
    expect(summary('page_to_interactive').sampleCount).toBe(0);

    localStorage.setItem(
      UX_LATENCY_STORAGE_KEY,
      JSON.stringify({ version: 2, samples: {} })
    );
    expect(summary('page_to_interactive').sampleCount).toBe(0);
  });

  it('notifies same-tab and cross-tab subscribers without exposing a payload', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeUxLatency(listener);

    recordUxLatency('gbrain_query', 90);
    expect(listener).toHaveBeenCalledTimes(1);

    globalThis.dispatchEvent(
      new StorageEvent('storage', { key: UX_LATENCY_STORAGE_KEY })
    );
    expect(listener).toHaveBeenCalledTimes(2);
    globalThis.dispatchEvent(
      new StorageEvent('storage', { key: 'unrelated-storage' })
    );
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    globalThis.dispatchEvent(new Event(UX_LATENCY_EVENT_NAME));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('fails closed when browser storage is unavailable', () => {
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('blocked');
      });

    expect(recordUxLatency('chat_first_token', 100)).toBe(false);
    expect(setItem).toHaveBeenCalled();
  });

  it('fails closed when storage reads or the browser global are unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked');
    });
    expect(summary('chat_first_token').sampleCount).toBe(0);
    vi.restoreAllMocks();

    vi.stubGlobal('window', undefined);
    expect(recordUxLatency('chat_first_token', 100)).toBe(false);
    expect(getUxLatencySummaries()).toHaveLength(5);
    expect(() => resetUxLatencyForTests()).not.toThrow();
    expect(() => subscribeUxLatency(vi.fn())()).not.toThrow();
  });
});

describe('interaction performance marks', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('marks and measures a named interaction point', () => {
    const mark = vi.fn();
    const measure = vi.fn();
    vi.stubGlobal('performance', { mark, measure });
    vi.stubGlobal('crypto', { randomUUID: () => 'interaction-id' });

    const handle = markInteractionStart('composer-send');
    expect(handle).toEqual({
      id: 'composer-send:interaction-id',
      name: 'composer-send',
      startMark: 'composer-send:interaction-id:start',
    });
    expect(mark).toHaveBeenCalledWith('composer-send:interaction-id:start');

    expect(measureInteractionPoint(handle, 'feedback')).toBe(
      'composer-send:event-to-feedback'
    );
    expect(mark).toHaveBeenCalledWith('composer-send:interaction-id:feedback');
    expect(measure).toHaveBeenCalledWith(
      'composer-send:event-to-feedback',
      'composer-send:interaction-id:start',
      'composer-send:interaction-id:feedback'
    );
  });

  it('falls back to a timestamp interaction id without randomUUID', () => {
    const mark = vi.fn();
    vi.stubGlobal('performance', { mark, measure: vi.fn() });
    vi.stubGlobal('crypto', {});
    vi.spyOn(Date, 'now').mockReturnValue(1234);

    expect(markInteractionStart('fallback')?.id).toMatch(/^fallback:1234-\d+$/);
  });

  it('returns null when marks or handles are unavailable', async () => {
    vi.stubGlobal('performance', {});

    expect(markInteractionStart('unavailable')).toBeNull();
    expect(measureInteractionPoint(null, 'feedback')).toBeNull();
    expect(await measureInteractionNextPaint(null)).toBeNull();
  });

  it('measures after two animation frames', async () => {
    const mark = vi.fn();
    const measure = vi.fn();
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('performance', { mark, measure });
    vi.stubGlobal('crypto', { randomUUID: () => 'paint-id' });
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame);
    const handle = markInteractionStart('navigation');

    await expect(measureInteractionNextPaint(handle)).resolves.toBe(
      'navigation:event-to-first-paint'
    );
    expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
  });
});
