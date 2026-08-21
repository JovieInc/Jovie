import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useOptimisticToggle } from '@/features/dashboard/hooks/useOptimisticToggle';

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));

vi.mock('@/components/feedback', () => ({
  toast: { error: toastError },
}));

function deferred() {
  let resolve!: () => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

describe('useOptimisticToggle', () => {
  beforeEach(() => {
    toastError.mockReset();
  });

  it('exposes optimistic, pending, and successful save states around mutation', async () => {
    const mutation = deferred();
    const mutateAsync = vi.fn(() => mutation.promise);
    const onOptimisticUpdate = vi.fn();
    const { result } = renderHook(() =>
      useOptimisticToggle({
        initialValue: false,
        mutateAsync,
        onOptimisticUpdate,
      })
    );

    let togglePromise!: Promise<void>;
    act(() => {
      togglePromise = result.current.handleToggle(true);
    });

    expect(result.current.checked).toBe(true);
    expect(result.current.isPending).toBe(true);
    expect(result.current.saveStatus).toMatchObject({
      saving: true,
      success: null,
      error: null,
    });
    expect(onOptimisticUpdate).toHaveBeenCalledExactlyOnceWith(true);

    await act(async () => {
      mutation.resolve();
      await togglePromise;
    });

    expect(mutateAsync).toHaveBeenCalledExactlyOnceWith(true);
    expect(result.current.checked).toBe(true);
    expect(result.current.isPending).toBe(false);
    expect(result.current.saveStatus).toMatchObject({
      saving: false,
      success: true,
      error: null,
    });
  });

  it('rolls back state and exposes the mutation failure', async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new Error('Unavailable'));
    const onOptimisticUpdate = vi.fn();
    const { result } = renderHook(() =>
      useOptimisticToggle({
        initialValue: false,
        mutateAsync,
        onOptimisticUpdate,
        errorMessage: 'Could not save this setting.',
      })
    );

    await act(async () => {
      await result.current.handleToggle(true);
    });

    expect(onOptimisticUpdate).toHaveBeenNthCalledWith(1, true);
    expect(onOptimisticUpdate).toHaveBeenNthCalledWith(2, false);
    expect(result.current.checked).toBe(false);
    expect(result.current.isPending).toBe(false);
    expect(result.current.saveStatus).toMatchObject({
      saving: false,
      success: false,
      error: 'Could not save this setting.',
    });
    expect(toastError).toHaveBeenCalledExactlyOnceWith(
      'Could not save this setting.'
    );
  });

  it('can leave error announcements to the mutation layer while rolling back', async () => {
    const onOptimisticUpdate = vi.fn();
    const { result } = renderHook(() =>
      useOptimisticToggle({
        initialValue: false,
        mutateAsync: vi.fn().mockRejectedValue(new Error('Unavailable')),
        onOptimisticUpdate,
        errorMessage: 'Could not save this setting.',
        showErrorToast: false,
      })
    );

    await act(async () => {
      await result.current.handleToggle(true);
    });

    expect(result.current.checked).toBe(false);
    expect(result.current.saveStatus.error).toBe(
      'Could not save this setting.'
    );
    expect(onOptimisticUpdate).toHaveBeenNthCalledWith(2, false);
    expect(toastError).not.toHaveBeenCalled();
  });

  it('still synchronizes a genuinely changed upstream value', () => {
    const mutateAsync = vi.fn();
    const { result, rerender } = renderHook(
      ({ initialValue }) => useOptimisticToggle({ initialValue, mutateAsync }),
      { initialProps: { initialValue: false } }
    );

    rerender({ initialValue: true });

    expect(result.current.checked).toBe(true);
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('resets local state and save status when the owner changes', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ syncKey }) =>
        useOptimisticToggle({
          initialValue: false,
          syncKey,
          mutateAsync,
        }),
      { initialProps: { syncKey: 'profile-1' } }
    );

    await act(async () => {
      await result.current.handleToggle(true);
    });
    expect(result.current.checked).toBe(true);
    expect(result.current.saveStatus.success).toBe(true);

    rerender({ syncKey: 'profile-2' });

    expect(result.current.checked).toBe(false);
    expect(result.current.isPending).toBe(false);
    expect(result.current.saveStatus).toMatchObject({
      saving: false,
      success: null,
      error: null,
    });
  });

  it('invalidates an in-flight mutation when the owner changes', async () => {
    const mutation = deferred();
    const onOptimisticUpdate = vi.fn();
    const { result, rerender } = renderHook(
      ({ syncKey }) =>
        useOptimisticToggle({
          initialValue: false,
          syncKey,
          mutateAsync: () => mutation.promise,
          onOptimisticUpdate,
        }),
      { initialProps: { syncKey: 'profile-1' } }
    );

    let togglePromise!: Promise<void>;
    act(() => {
      togglePromise = result.current.handleToggle(true);
    });
    expect(result.current.isPending).toBe(true);

    rerender({ syncKey: 'profile-2' });
    expect(result.current.checked).toBe(false);
    expect(result.current.isPending).toBe(false);

    await act(async () => {
      mutation.resolve();
      await togglePromise;
    });

    expect(result.current.checked).toBe(false);
    expect(result.current.saveStatus.success).toBeNull();
    expect(onOptimisticUpdate).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('ignores a stale rejection after the owner changes', async () => {
    const mutation = deferred();
    const onOptimisticUpdate = vi.fn();
    const { result, rerender } = renderHook(
      ({ syncKey }) =>
        useOptimisticToggle({
          initialValue: false,
          syncKey,
          mutateAsync: () => mutation.promise,
          onOptimisticUpdate,
        }),
      { initialProps: { syncKey: 'profile-1' } }
    );

    let togglePromise!: Promise<void>;
    act(() => {
      togglePromise = result.current.handleToggle(true);
    });
    rerender({ syncKey: 'profile-2' });

    await act(async () => {
      mutation.reject(new Error('Old owner failed'));
      await togglePromise;
    });

    expect(result.current.checked).toBe(false);
    expect(result.current.saveStatus.error).toBeNull();
    expect(onOptimisticUpdate).toHaveBeenCalledExactlyOnceWith(true);
    expect(toastError).not.toHaveBeenCalled();
  });
});
