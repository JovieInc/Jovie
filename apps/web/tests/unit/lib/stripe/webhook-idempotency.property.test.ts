/**
 * Property-based tests for Stripe webhook idempotency.
 *
 * Locks the delivery/replay safety laws:
 * - unknown event types are dropped without throwing (replay and live
 *   delivery share this path)
 * - a handler runs exactly once per processed event with a context that
 *   carries the event's own id and timestamp
 * - skipped handlers never surface errors; only a genuine handler failure
 *   with an error message rejects
 * - the idempotency lock admits exactly one in-flight operation per key,
 *   never excludes different keys, and always releases (success or throw)
 */

import fc from 'fast-check';
import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockGetHandler, mockCaptureCriticalError, mockGetRedis } = vi.hoisted(
  () => ({
    mockGetHandler: vi.fn(),
    mockCaptureCriticalError: vi.fn(),
    mockGetRedis: vi.fn(),
  })
);

vi.mock('@/lib/stripe/webhooks', () => ({
  getHandler: mockGetHandler,
}));
vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: mockCaptureCriticalError,
  captureError: vi.fn(),
  captureWarning: vi.fn(),
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/redis', () => ({ getRedis: mockGetRedis }));

import {
  IdempotencyError,
  tryWithIdempotency,
  withIdempotency,
} from '@/lib/idempotency';
import { processStripeWebhookEvent } from '@/lib/stripe/webhooks/process-event';

const eventArb = fc.record({
  id: fc.stringMatching(/^evt_[a-zA-Z0-9_]{1,24}$/),
  type: fc.stringMatching(/^[a-z][a-z0-9_.]{0,40}$/),
  data: fc.constant({ object: { id: 'obj_prop' } }),
});

beforeEach(() => {
  vi.clearAllMocks();
  mockGetRedis.mockReturnValue(null);
});

describe('processStripeWebhookEvent (property)', () => {
  it('drops unknown event types without throwing or handling', async () => {
    await fc.assert(
      fc.asyncProperty(eventArb, async event => {
        mockGetHandler.mockReturnValue(null);
        const stripeEventTimestamp = new Date(1_700_000_000_000);
        await expect(
          processStripeWebhookEvent(
            event as unknown as Stripe.Event,
            stripeEventTimestamp
          )
        ).resolves.toBeUndefined();
        expect(mockGetHandler).toHaveBeenCalledWith(event.type);
        expect(mockCaptureCriticalError).not.toHaveBeenCalled();
      })
    );
  });

  it('runs a registered handler exactly once with the event context', async () => {
    const nonThrowingResultArb = fc.oneof(
      fc.constant({ success: true }),
      fc.record({
        success: fc.constant(false),
        skipped: fc.constant(true),
        error: fc.option(fc.stringMatching(/^[\w .-]{0,40}$/), {
          nil: undefined,
        }),
      })
    );
    await fc.assert(
      fc.asyncProperty(
        eventArb,
        nonThrowingResultArb,
        async (event, result) => {
          const handle = vi.fn().mockResolvedValue(result);
          mockGetHandler.mockReturnValue({ handle });
          const stripeEventTimestamp = new Date(1_700_000_000_000);
          await expect(
            processStripeWebhookEvent(
              event as unknown as Stripe.Event,
              stripeEventTimestamp
            )
          ).resolves.toBeUndefined();
          expect(handle).toHaveBeenCalledTimes(1);
          const context = handle.mock.calls[0][0];
          expect(context.event).toBe(event);
          expect(context.stripeEventId).toBe(event.id);
          expect(context.stripeEventTimestamp).toBe(stripeEventTimestamp);
          expect(mockCaptureCriticalError).not.toHaveBeenCalled();
        }
      )
    );
  });

  it('throws exactly for genuine handler failures carrying an error', async () => {
    await fc.assert(
      fc.asyncProperty(
        eventArb,
        fc.boolean(),
        fc.option(fc.stringMatching(/^[\w .-]{1,40}$/), { nil: undefined }),
        async (event, skipped, error) => {
          const handle = vi
            .fn()
            .mockResolvedValue({ success: false, skipped, error });
          mockGetHandler.mockReturnValue({ handle });
          const processed = processStripeWebhookEvent(
            event as unknown as Stripe.Event,
            new Date(1_700_000_000_000)
          );
          if (!skipped && error !== undefined) {
            await expect(processed).rejects.toThrow(error);
            expect(mockCaptureCriticalError).toHaveBeenCalled();
          } else {
            await expect(processed).resolves.toBeUndefined();
          }
        }
      )
    );
  });
});

describe('idempotency locks (property)', () => {
  let keyCounter = 0;
  const freshKey = (label: string): string => {
    keyCounter += 1;
    return `prop:${label}:${keyCounter}`;
  };

  it('admits exactly one of N concurrent operations per key', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 8 }),
        fc.nat({ max: 1000 }),
        async (concurrency, value) => {
          const key = freshKey('mutex');
          const fn = vi.fn().mockResolvedValue(value);
          const settles = await Promise.allSettled(
            Array.from({ length: concurrency }, () =>
              withIdempotency(key, 30, fn)
            )
          );
          const fulfilled = settles.filter(
            outcome => outcome.status === 'fulfilled'
          );
          const rejected = settles.filter(
            outcome => outcome.status === 'rejected'
          );
          expect(fulfilled).toHaveLength(1);
          expect(rejected).toHaveLength(concurrency - 1);
          for (const outcome of rejected) {
            expect(outcome.reason).toBeInstanceOf(IdempotencyError);
          }
          expect(fn).toHaveBeenCalledTimes(1);
        }
      ),
      { numRuns: 40 }
    );
  });

  it('never excludes operations under different keys', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .uniqueArray(fc.stringMatching(/^[a-z0-9_]{1,16}$/), {
            minLength: 2,
            maxLength: 8,
          })
          .map(keys => keys.map(key => `prop:distinct:${key}`)),
        async keys => {
          const results = await Promise.all(
            keys.map(key => withIdempotency(key, 30, async () => key))
          );
          expect(results).toEqual(keys);
        }
      ),
      { numRuns: 40 }
    );
  });

  it('releases the lock after completion so retries proceed', async () => {
    await fc.assert(
      fc.asyncProperty(fc.nat({ max: 1000 }), async value => {
        const key = freshKey('retry');
        const first = await withIdempotency(key, 30, async () => value);
        expect(first).toBe(value);
        const second = await withIdempotency(key, 30, async () => value + 1);
        expect(second).toBe(value + 1);
      })
    );
  });

  it('releases the lock when the operation throws, surfacing the error', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^boom_[a-z0-9]{0,10}$/),
        async message => {
          const key = freshKey('throw');
          await expect(
            withIdempotency(key, 30, async () => {
              throw new Error(message);
            })
          ).rejects.toThrow(message);
          const retry = await tryWithIdempotency(key, 30, async () => 'ok');
          expect(retry.success).toBe(true);
          expect(retry.data).toBe('ok');
        }
      )
    );
  });
});
