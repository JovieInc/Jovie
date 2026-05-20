import { describe, expect, it, vi } from 'vitest';
import { withSerializableRetry } from '@/lib/db/serializable-retry';

function makePgError(code: string, message = 'fail') {
  return Object.assign(new Error(message), { code });
}

describe('withSerializableRetry', () => {
  it('returns the result on first success without sleeping', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fn = vi.fn().mockResolvedValue('ok');

    const result = await withSerializableRetry(fn, { sleep });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries on SQLSTATE 40001 and eventually succeeds', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fn = vi
      .fn()
      .mockRejectedValueOnce(makePgError('40001'))
      .mockRejectedValueOnce(makePgError('40001'))
      .mockResolvedValue('ok');

    const result = await withSerializableRetry(fn, { sleep });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
    // Two backoffs between three attempts
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('retries on deadlock (40P01) the same way', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fn = vi
      .fn()
      .mockRejectedValueOnce(makePgError('40P01'))
      .mockResolvedValue('ok');

    const result = await withSerializableRetry(fn, { sleep });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry on non-retryable errors', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fn = vi.fn().mockRejectedValue(makePgError('23505', 'duplicate'));

    await expect(withSerializableRetry(fn, { sleep })).rejects.toThrow(
      'duplicate'
    );
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('throws the last error if all attempts exhaust', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const err = makePgError('40001', 'serialization');
    const fn = vi.fn().mockRejectedValue(err);

    await expect(
      withSerializableRetry(fn, { sleep, attempts: 3 })
    ).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('detects SQLSTATE on a wrapped cause chain', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const wrapped = Object.assign(new Error('drizzle wrap'), {
      cause: makePgError('40001'),
    });
    const fn = vi.fn().mockRejectedValueOnce(wrapped).mockResolvedValue('ok');

    const result = await withSerializableRetry(fn, { sleep });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('uses exponential-ish backoff with the configured base delay', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fn = vi
      .fn()
      .mockRejectedValueOnce(makePgError('40001'))
      .mockRejectedValueOnce(makePgError('40001'))
      .mockResolvedValue('ok');

    await withSerializableRetry(fn, { sleep, baseDelayMs: 10 });

    // First sleep ~10ms (+ jitter <25), second ~20ms (+ jitter <25)
    const first = sleep.mock.calls[0]?.[0] as number;
    const second = sleep.mock.calls[1]?.[0] as number;
    expect(first).toBeGreaterThanOrEqual(10);
    expect(first).toBeLessThan(10 + 25);
    expect(second).toBeGreaterThanOrEqual(20);
    expect(second).toBeLessThan(20 + 25);
  });

  it('does not rely on Math.random for retry jitter', async () => {
    const randomSpy = vi.spyOn(Math, 'random');
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fn = vi
      .fn()
      .mockRejectedValueOnce(makePgError('40001'))
      .mockResolvedValue('ok');

    await withSerializableRetry(fn, { sleep, baseDelayMs: 10 });

    expect(randomSpy).not.toHaveBeenCalled();
    randomSpy.mockRestore();
  });
});
