import * as Sentry from '@sentry/nextjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SERVER_ANALYTICS_DELIVERY_TIMEOUT_MS,
  trackServerEvent,
} from './server-analytics';

// Sibling of server-analytics.test.ts (kept under its size-500 baseline):
// owns the delivery-timeout contract for the standalone sink (JOV-8319).
// The timeout is handled — the caller always receives the structured
// `{ ok: false, error: 'delivery_unknown' }` result — so it is reported as
// a warning, never as an error exception. The abandoned insert keeps
// running against Postgres and settles the true outcome after the guard:
// a late success means the event was not lost (breadcrumb only); a late
// failure is a genuine loss and is still captured as an error.

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  onConflictDoNothing: vi.fn(),
  returning: vi.fn(),
  values: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: { insert: mocks.insert },
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

const PROFILE_ID = '11111111-1111-4111-8111-111111111111';
const RELEASE_ID = '22222222-2222-4222-8222-222222222222';

function createDeferredInsert() {
  let resolve!: (rows: { id: string }[]) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<{ id: string }[]>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('server analytics delivery timeout (JOV-8319)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.returning.mockResolvedValue([{ id: 'event-1' }]);
    mocks.onConflictDoNothing.mockReturnValue({ returning: mocks.returning });
    mocks.values.mockReturnValue({
      onConflictDoNothing: mocks.onConflictDoNothing,
      returning: mocks.returning,
    });
    mocks.insert.mockReturnValue({ values: mocks.values });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('bounds delivery latency and reports a timed-out insert as a handled warning', async () => {
    vi.useFakeTimers();
    const { promise, resolve } = createDeferredInsert();
    mocks.returning.mockImplementationOnce(() => promise);

    const delivery = trackServerEvent('release_deleted', {
      profileId: PROFILE_ID,
      releaseId: RELEASE_ID,
    });
    await vi.advanceTimersByTimeAsync(SERVER_ANALYTICS_DELIVERY_TIMEOUT_MS);

    await expect(delivery).resolves.toEqual({
      ok: false,
      error: 'delivery_unknown',
    });
    // The timeout is handled: the caller receives a structured result and
    // every call site treats it as best-effort, so it is reported at warning
    // level, never as an error exception.
    expect(Sentry.captureMessage).toHaveBeenCalledExactlyOnceWith(
      'Server analytics delivery timed out after 17000ms',
      expect.objectContaining({
        level: 'warning',
        tags: expect.objectContaining({
          context: 'server_analytics_delivery',
          delivery_outcome: 'unknown',
          event_name: 'release_deleted',
        }),
      })
    );
    expect(Sentry.captureException).not.toHaveBeenCalled();

    // The abandoned insert keeps running against Postgres; when it lands the
    // event was not lost and no error is reported.
    resolve([{ id: 'event-late-success' }]);
    await vi.advanceTimersByTimeAsync(0);
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining(
          'settled successfully after the delivery timeout'
        ),
        data: expect.objectContaining({
          event_name: 'release_deleted',
          phase: 'late_success',
        }),
      })
    );
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('reports a real event loss when the timed-out insert fails after the timeout', async () => {
    vi.useFakeTimers();
    const { promise, reject } = createDeferredInsert();
    const lateError = new Error('connection terminated unexpectedly');
    mocks.returning.mockImplementationOnce(() => promise);

    const delivery = trackServerEvent('release_deleted', {
      profileId: PROFILE_ID,
      releaseId: RELEASE_ID,
    });
    await vi.advanceTimersByTimeAsync(SERVER_ANALYTICS_DELIVERY_TIMEOUT_MS);
    await expect(delivery).resolves.toEqual({
      ok: false,
      error: 'delivery_unknown',
    });
    expect(Sentry.captureException).not.toHaveBeenCalled();

    // A late failure is a genuine loss: the event never landed, so it is
    // reported as an error with its own delivery outcome tag.
    reject(lateError);
    await vi.advanceTimersByTimeAsync(0);
    expect(Sentry.captureException).toHaveBeenCalledExactlyOnceWith(
      lateError,
      expect.objectContaining({
        tags: expect.objectContaining({
          context: 'server_analytics_delivery',
          delivery_outcome: 'failed_after_timeout',
          event_name: 'release_deleted',
        }),
      })
    );
  });
});
