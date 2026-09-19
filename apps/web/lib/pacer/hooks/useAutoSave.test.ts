import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useAutoSave } from './useAutoSave';

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

describe('useAutoSave', () => {
  it('does not resubmit a completed revision when flush follows a successful debounce', async () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useAutoSave({ saveFn, wait: 15, maxRetries: 1 })
    );

    act(() => {
      result.current.save('draft-1');
    });

    await act(async () => {
      await new Promise(resolve => {
        setTimeout(resolve, 25);
      });
    });

    expect(saveFn.mock.calls.map(call => call[0])).toEqual(['draft-1']);

    await act(async () => {
      await result.current.flush();
    });

    expect(saveFn.mock.calls.map(call => call[0])).toEqual(['draft-1']);
  });

  it('rejects flush when the save fails and keeps the pending revision recoverable', async () => {
    const saveFn = vi.fn().mockRejectedValue(new Error('persist failed'));
    const { result } = renderHook(() =>
      useAutoSave({ saveFn, wait: 20, maxRetries: 1 })
    );

    act(() => {
      result.current.save('keep-me');
    });

    let flushError: unknown;
    await act(async () => {
      try {
        await result.current.flush();
      } catch (error) {
        flushError = error;
      }
    });

    expect(flushError).toMatchObject({ message: 'persist failed' });
    expect(result.current.error?.message).toBe('persist failed');
    expect(result.current.isDirty).toBe(true);

    saveFn.mockResolvedValueOnce(undefined);
    await act(async () => {
      await result.current.flush();
    });

    expect(saveFn).toHaveBeenCalledTimes(2);
    expect(saveFn).toHaveBeenLastCalledWith('keep-me', expect.any(Object));
    expect(result.current.isDirty).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('keeps a newer edit dirty when it arrives during an in-flight write', async () => {
    const first = deferred();
    const saveFn = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useAutoSave({ saveFn, wait: 20, maxRetries: 1 })
    );

    act(() => {
      result.current.save('rev-a');
    });

    let flushPromise!: Promise<void>;
    act(() => {
      flushPromise = result.current.flush();
    });
    await waitFor(() => expect(saveFn).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.save('rev-b');
    });

    await act(async () => {
      first.resolve();
      await flushPromise;
    });

    expect(saveFn.mock.calls.map(call => call[0])).toEqual(['rev-a', 'rev-b']);
    expect(result.current.isDirty).toBe(false);
  });

  it('does not send a previous resource edit through a new resource callback', async () => {
    const saveA = vi.fn().mockResolvedValue(undefined);
    const saveB = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ resourceKey, saveFn }) =>
        useAutoSave({ saveFn, resourceKey, wait: 20, maxRetries: 1 }),
      { initialProps: { resourceKey: 'profile-a', saveFn: saveA } }
    );

    act(() => {
      result.current.save({ name: 'A draft' });
    });

    rerender({ resourceKey: 'profile-b', saveFn: saveB });

    await act(async () => {
      await result.current.flush();
    });

    expect(saveA).not.toHaveBeenCalled();
    expect(saveB).not.toHaveBeenCalled();
  });

  it('does not apply an older acknowledgment over a newer local revision', async () => {
    const first = deferred();
    const onSuccess = vi.fn();
    const saveFn = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useAutoSave({ saveFn, onSuccess, wait: 20, maxRetries: 1 })
    );

    act(() => {
      result.current.save('older');
    });

    let flushA!: Promise<void>;
    act(() => {
      flushA = result.current.flush();
    });
    await waitFor(() => expect(saveFn).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.save('newer');
    });

    expect(onSuccess).not.toHaveBeenCalled();
    expect(result.current.isDirty).toBe(true);

    await act(async () => {
      first.resolve();
      await flushA;
    });

    expect(saveFn.mock.calls.map(call => call[0])).toEqual(['older', 'newer']);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess.mock.calls[0]?.[0]).toMatchObject({
      revision: 2,
      isLatest: true,
    });
    expect(result.current.isDirty).toBe(false);
  });

  it('exposes a live isLatest flag so saveFn can skip apply after a newer edit arrives', async () => {
    const first = deferred();
    const latestAtApply: boolean[] = [];
    const saveFn = vi.fn().mockImplementation(async (_data, meta) => {
      if (saveFn.mock.calls.length === 1) {
        await first.promise;
        latestAtApply.push(meta.isLatest);
      }
    });
    const { result } = renderHook(() =>
      useAutoSave({ saveFn, wait: 20, maxRetries: 1 })
    );

    act(() => {
      result.current.save('older');
    });

    let flushA!: Promise<void>;
    act(() => {
      flushA = result.current.flush();
    });
    await waitFor(() => expect(saveFn).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.save('newer');
    });

    await act(async () => {
      first.resolve();
      await flushA;
    });

    expect(latestAtApply).toEqual([false]);
  });

  it('does not report validation or equal-payload no-ops as new durable writes', async () => {
    const onSuccess = vi.fn();
    const saveFn = vi.fn().mockImplementation(async (value: string) => {
      if (value === 'invalid') {
        throw new Error('validation failed');
      }
    });
    const { result } = renderHook(() =>
      useAutoSave({
        saveFn,
        onSuccess,
        wait: 15,
        maxRetries: 1,
        isEqual: (left, right) => left === right,
      })
    );

    act(() => {
      result.current.save('valid');
    });
    await act(async () => {
      await result.current.flush();
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.save('valid');
    });
    await act(async () => {
      await result.current.flush();
    });
    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledTimes(1);

    let validationError: unknown;
    await act(async () => {
      result.current.save('invalid');
      try {
        await result.current.flush();
      } catch (error) {
        validationError = error;
      }
    });
    expect(validationError).toMatchObject({ message: 'validation failed' });
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(result.current.error?.message).toBe('validation failed');
  });

  it('lets independent hook instances save concurrently', async () => {
    const first = deferred();
    const second = deferred();
    const saveA = vi.fn().mockImplementation(() => first.promise);
    const saveB = vi.fn().mockImplementation(() => second.promise);

    const hookA = renderHook(() =>
      useAutoSave({ saveFn: saveA, wait: 10, maxRetries: 1 })
    );
    const hookB = renderHook(() =>
      useAutoSave({ saveFn: saveB, wait: 10, maxRetries: 1 })
    );

    let flushA!: Promise<void>;
    let flushB!: Promise<void>;
    act(() => {
      hookA.result.current.save('resource-a');
      hookB.result.current.save('resource-b');
      flushA = hookA.result.current.flush();
      flushB = hookB.result.current.flush();
    });

    await waitFor(() => {
      expect(saveA).toHaveBeenCalledTimes(1);
      expect(saveB).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      first.resolve();
      second.resolve();
      await Promise.all([flushA, flushB]);
    });
  });

  it('does not replay an acknowledged revision after a later timeout-shaped failure', async () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useAutoSave({ saveFn, wait: 10, maxRetries: 1 })
    );

    act(() => {
      result.current.save('committed');
    });
    await act(async () => {
      await result.current.flush();
    });
    expect(saveFn).toHaveBeenCalledTimes(1);

    saveFn.mockRejectedValueOnce(new Error('HTTP 408 Request Timeout'));
    act(() => {
      result.current.save('committed');
    });
    await act(async () => {
      await result.current.flush();
    });

    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(result.current.isDirty).toBe(false);
  });
});

describe('useAutoSave legitimate neighbors', () => {
  it('coalesces replaceable edits that have not been sent yet', async () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useAutoSave({ saveFn, wait: 20, maxRetries: 1 })
    );

    act(() => {
      result.current.save('one');
      result.current.save('two');
      result.current.save('three');
    });

    await act(async () => {
      await result.current.flush();
    });

    expect(saveFn.mock.calls.map(call => call[0])).toEqual(['three']);
  });

  it('exposes dirty, saving, saved, and error states without a false success callback', async () => {
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const gate = deferred();
    const saveFn = vi.fn().mockImplementation(() => gate.promise);
    const { result } = renderHook(() =>
      useAutoSave({ saveFn, onSuccess, onError, wait: 15, maxRetries: 1 })
    );

    act(() => {
      result.current.save('draft');
    });
    expect(result.current.isDirty).toBe(true);
    expect(result.current.isSaving).toBe(false);

    let flushPromise!: Promise<void>;
    act(() => {
      flushPromise = result.current.flush();
    });
    await waitFor(() => expect(result.current.isSaving).toBe(true));

    await act(async () => {
      gate.reject(new Error('write failed'));
      await expect(flushPromise).rejects.toThrow('write failed');
    });

    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(result.current.isDirty).toBe(true);
    expect(result.current.isSaving).toBe(false);
    expect(result.current.lastSaved).toBeNull();
  });
});
