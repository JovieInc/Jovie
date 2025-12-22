import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProfileSaveToasts } from '@/lib/hooks/useProfileSaveToasts';
import type { SaveStatus } from '@/types';

const loading = vi.fn();
const success = vi.fn();
const error = vi.fn();
const dismiss = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    loading: (...args: unknown[]) => loading(...args),
    success: (...args: unknown[]) => success(...args),
    error: (...args: unknown[]) => error(...args),
    dismiss: (...args: unknown[]) => dismiss(...args),
  },
}));

describe('useProfileSaveToasts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('emits loading/success/error/dismiss toasts based on status', async () => {
    const toastId = 'test-toast-id';

    const base: SaveStatus = {
      saving: false,
      success: null,
      error: null,
      lastSaved: null,
    };

    const { rerender } = renderHook(
      ({ status }: { status: SaveStatus }) =>
        useProfileSaveToasts(status, { toastId }),
      {
        initialProps: { status: base },
      }
    );

    await waitFor(() => {
      expect(dismiss).toHaveBeenCalledWith(toastId);
    });

    rerender({ status: { ...base, saving: true } });
    await waitFor(() => {
      expect(loading).toHaveBeenCalledWith('Saving…', { id: toastId });
    });

    rerender({ status: { ...base, saving: false, success: true } });
    await waitFor(() => {
      expect(success).toHaveBeenCalledWith('Saved', { id: toastId });
    });

    rerender({ status: { ...base, success: false, error: 'Nope' } });
    await waitFor(() => {
      expect(error).toHaveBeenCalledWith('Nope', { id: toastId });
    });

    rerender({ status: base });
    await waitFor(() => {
      expect(dismiss).toHaveBeenCalledWith(toastId);
    });
  });
});
