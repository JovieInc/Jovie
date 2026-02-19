import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockToast } = vi.hoisted(() => ({
  mockToast: Object.assign(vi.fn().mockReturnValue('toast-id'), {
    success: vi.fn().mockReturnValue('success-id'),
    error: vi.fn().mockReturnValue('error-id'),
    warning: vi.fn().mockReturnValue('warning-id'),
    info: vi.fn().mockReturnValue('info-id'),
    loading: vi.fn().mockReturnValue('loading-id'),
    dismiss: vi.fn(),
    promise: vi.fn(),
  }),
}));

vi.mock('sonner', () => ({ toast: mockToast }));

import {
  TOAST_DURATIONS,
  TOAST_MESSAGES,
  useNotifications,
} from '@/lib/hooks/useNotifications';

describe('useNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- TOAST_MESSAGES constants ----

  describe('TOAST_MESSAGES', () => {
    it('should define all success messages', () => {
      expect(TOAST_MESSAGES.SAVE_SUCCESS).toBe('Changes saved');
      expect(TOAST_MESSAGES.UPLOAD_SUCCESS).toBe('Upload complete');
      expect(TOAST_MESSAGES.DELETE_SUCCESS).toBe('Deleted successfully');
      expect(TOAST_MESSAGES.COPY_SUCCESS).toBe('Copied to clipboard');
      expect(TOAST_MESSAGES.SEND_SUCCESS).toBe('Sent successfully');
    });

    it('should define all error messages', () => {
      expect(TOAST_MESSAGES.SAVE_ERROR).toBe(
        'Failed to save. Please try again.'
      );
      expect(TOAST_MESSAGES.UPLOAD_ERROR).toBe(
        'Upload failed. Please try again.'
      );
      expect(TOAST_MESSAGES.DELETE_ERROR).toBe(
        'Failed to delete. Please try again.'
      );
      expect(TOAST_MESSAGES.COPY_ERROR).toBe('Failed to copy');
      expect(TOAST_MESSAGES.NETWORK_ERROR).toBe(
        'Network error. Check your connection.'
      );
      expect(TOAST_MESSAGES.GENERIC_ERROR).toBe(
        'Something went wrong. Please try again.'
      );
      expect(TOAST_MESSAGES.PERMISSION_ERROR).toBe(
        "You don't have permission to do that."
      );
      expect(TOAST_MESSAGES.SESSION_EXPIRED).toBe(
        'Your session expired. Please sign in again.'
      );
    });

    it('should define validation, info, and warning messages', () => {
      expect(TOAST_MESSAGES.REQUIRED_FIELD).toBeDefined();
      expect(TOAST_MESSAGES.INVALID_EMAIL).toBeDefined();
      expect(TOAST_MESSAGES.LOADING).toBe('Loading...');
      expect(TOAST_MESSAGES.UNSAVED_CHANGES).toBe('You have unsaved changes');
      expect(TOAST_MESSAGES.RATE_LIMIT).toBe('Too many requests. Please wait.');
    });
  });

  // ---- TOAST_DURATIONS constants ----

  describe('TOAST_DURATIONS', () => {
    it('should define all duration presets', () => {
      expect(TOAST_DURATIONS.SHORT).toBe(2000);
      expect(TOAST_DURATIONS.DEFAULT).toBe(4000);
      expect(TOAST_DURATIONS.MEDIUM).toBe(5000);
      expect(TOAST_DURATIONS.LONG).toBe(6000);
      expect(TOAST_DURATIONS.ACTION).toBe(8000);
      expect(TOAST_DURATIONS.PERSISTENT).toBe(Infinity);
    });
  });

  // ---- Core toast methods ----

  describe('success', () => {
    it('should call toast.success with default duration', () => {
      const { result } = renderHook(() => useNotifications());

      act(() => {
        result.current.success('Profile saved');
      });

      expect(mockToast.success).toHaveBeenCalledWith('Profile saved', {
        duration: TOAST_DURATIONS.DEFAULT,
      });
    });

    it('should allow custom options to override defaults', () => {
      const { result } = renderHook(() => useNotifications());

      act(() => {
        result.current.success('Done', { duration: 1000, id: 'custom' });
      });

      expect(mockToast.success).toHaveBeenCalledWith('Done', {
        duration: 1000,
        id: 'custom',
      });
    });

    it('should return a toast id', () => {
      const { result } = renderHook(() => useNotifications());
      let id: string | number = '';

      act(() => {
        id = result.current.success('Saved');
      });

      expect(id).toBe('success-id');
    });
  });

  describe('error', () => {
    it('should call toast.error with LONG duration', () => {
      const { result } = renderHook(() => useNotifications());

      act(() => {
        result.current.error('Something failed');
      });

      expect(mockToast.error).toHaveBeenCalledWith('Something failed', {
        duration: TOAST_DURATIONS.LONG,
      });
    });
  });

  describe('warning', () => {
    it('should call toast.warning with MEDIUM duration', () => {
      const { result } = renderHook(() => useNotifications());

      act(() => {
        result.current.warning('Watch out');
      });

      expect(mockToast.warning).toHaveBeenCalledWith('Watch out', {
        duration: TOAST_DURATIONS.MEDIUM,
      });
    });
  });

  describe('info', () => {
    it('should call toast.info with DEFAULT duration', () => {
      const { result } = renderHook(() => useNotifications());

      act(() => {
        result.current.info('FYI');
      });

      expect(mockToast.info).toHaveBeenCalledWith('FYI', {
        duration: TOAST_DURATIONS.DEFAULT,
      });
    });
  });

  describe('loading', () => {
    it('should call toast.loading with PERSISTENT duration', () => {
      const { result } = renderHook(() => useNotifications());

      act(() => {
        result.current.loading('Please wait...');
      });

      expect(mockToast.loading).toHaveBeenCalledWith('Please wait...', {
        duration: TOAST_DURATIONS.PERSISTENT,
      });
    });
  });

  // ---- Dismiss ----

  describe('dismiss', () => {
    it('should dismiss a specific toast by id', () => {
      const { result } = renderHook(() => useNotifications());

      act(() => {
        result.current.dismiss('toast-123');
      });

      expect(mockToast.dismiss).toHaveBeenCalledWith('toast-123');
    });

    it('should dismiss all toasts when called without args', () => {
      const { result } = renderHook(() => useNotifications());

      act(() => {
        result.current.dismiss();
      });

      expect(mockToast.dismiss).toHaveBeenCalledWith(undefined);
    });
  });

  // ---- Action toasts ----

  describe('undo', () => {
    it('should create an action toast with Undo label', () => {
      const { result } = renderHook(() => useNotifications());
      const onUndo = vi.fn();

      act(() => {
        result.current.undo('Item deleted', onUndo);
      });

      expect(mockToast).toHaveBeenCalledWith('Item deleted', {
        duration: TOAST_DURATIONS.ACTION,
        action: {
          label: 'Undo',
          onClick: onUndo,
        },
      });
    });

    it('should support custom action label', () => {
      const { result } = renderHook(() => useNotifications());
      const onUndo = vi.fn();

      act(() => {
        result.current.undo('Removed', onUndo, { actionLabel: 'Restore' });
      });

      expect(mockToast).toHaveBeenCalledWith('Removed', {
        duration: TOAST_DURATIONS.ACTION,
        action: {
          label: 'Restore',
          onClick: onUndo,
        },
      });
    });
  });

  describe('retry', () => {
    it('should create an error toast with Retry label', () => {
      const { result } = renderHook(() => useNotifications());
      const onRetry = vi.fn();

      act(() => {
        result.current.retry('Upload failed', onRetry);
      });

      expect(mockToast.error).toHaveBeenCalledWith('Upload failed', {
        duration: TOAST_DURATIONS.ACTION,
        action: {
          label: 'Retry',
          onClick: onRetry,
        },
      });
    });

    it('should support custom action label for retry', () => {
      const { result } = renderHook(() => useNotifications());
      const onRetry = vi.fn();

      act(() => {
        result.current.retry('Error', onRetry, {
          actionLabel: 'Try again',
        });
      });

      expect(mockToast.error).toHaveBeenCalledWith('Error', {
        duration: TOAST_DURATIONS.ACTION,
        action: {
          label: 'Try again',
          onClick: onRetry,
        },
      });
    });
  });

  // ---- Promise toast ----

  describe('promise', () => {
    it('should call toast.promise with custom messages', () => {
      const { result } = renderHook(() => useNotifications());
      const promise = Promise.resolve('data');

      act(() => {
        result.current.promise(promise, {
          loading: 'Saving...',
          success: 'Saved!',
          error: 'Failed!',
        });
      });

      expect(mockToast.promise).toHaveBeenCalledWith(promise, {
        loading: 'Saving...',
        success: 'Saved!',
        error: 'Failed!',
      });
    });

    it('should use default messages when options are omitted', () => {
      const { result } = renderHook(() => useNotifications());
      const promise = Promise.resolve(42);

      act(() => {
        result.current.promise(promise);
      });

      expect(mockToast.promise).toHaveBeenCalledWith(promise, {
        loading: TOAST_MESSAGES.PROCESSING,
        success: TOAST_MESSAGES.SAVE_SUCCESS,
        error: TOAST_MESSAGES.GENERIC_ERROR,
      });
    });

    it('should return the original promise', async () => {
      const { result } = renderHook(() => useNotifications());
      const promise = Promise.resolve('resolved-value');

      let returned: Promise<string> | undefined;
      act(() => {
        returned = result.current.promise(promise);
      });

      await expect(returned).resolves.toBe('resolved-value');
    });
  });

  // ---- Common pattern shortcuts ----

  describe('common shortcuts', () => {
    it('saveSuccess should use SAVE_SUCCESS message', () => {
      const { result } = renderHook(() => useNotifications());

      act(() => {
        result.current.saveSuccess();
      });

      expect(mockToast.success).toHaveBeenCalledWith(
        TOAST_MESSAGES.SAVE_SUCCESS,
        { duration: TOAST_DURATIONS.DEFAULT }
      );
    });

    it('saveError should use SAVE_ERROR message', () => {
      const { result } = renderHook(() => useNotifications());

      act(() => {
        result.current.saveError();
      });

      expect(mockToast.error).toHaveBeenCalledWith(TOAST_MESSAGES.SAVE_ERROR, {
        duration: TOAST_DURATIONS.LONG,
      });
    });

    it('uploadSuccess should use UPLOAD_SUCCESS message', () => {
      const { result } = renderHook(() => useNotifications());

      act(() => {
        result.current.uploadSuccess();
      });

      expect(mockToast.success).toHaveBeenCalledWith(
        TOAST_MESSAGES.UPLOAD_SUCCESS,
        { duration: TOAST_DURATIONS.DEFAULT }
      );
    });

    it('deleteSuccess should use DELETE_SUCCESS message', () => {
      const { result } = renderHook(() => useNotifications());

      act(() => {
        result.current.deleteSuccess();
      });

      expect(mockToast.success).toHaveBeenCalledWith(
        TOAST_MESSAGES.DELETE_SUCCESS,
        { duration: TOAST_DURATIONS.DEFAULT }
      );
    });

    it('copySuccess should use SHORT duration', () => {
      const { result } = renderHook(() => useNotifications());

      act(() => {
        result.current.copySuccess();
      });

      expect(mockToast.success).toHaveBeenCalledWith(
        TOAST_MESSAGES.COPY_SUCCESS,
        { duration: TOAST_DURATIONS.SHORT }
      );
    });

    it('networkError should use NETWORK_ERROR message', () => {
      const { result } = renderHook(() => useNotifications());

      act(() => {
        result.current.networkError();
      });

      expect(mockToast.error).toHaveBeenCalledWith(
        TOAST_MESSAGES.NETWORK_ERROR,
        { duration: TOAST_DURATIONS.LONG }
      );
    });

    it('genericError should use GENERIC_ERROR message', () => {
      const { result } = renderHook(() => useNotifications());

      act(() => {
        result.current.genericError();
      });

      expect(mockToast.error).toHaveBeenCalledWith(
        TOAST_MESSAGES.GENERIC_ERROR,
        { duration: TOAST_DURATIONS.LONG }
      );
    });
  });

  // ---- handleError ----

  describe('handleError', () => {
    it('should extract message from string errors', () => {
      const { result } = renderHook(() => useNotifications());

      act(() => {
        result.current.handleError('Something broke');
      });

      expect(mockToast.error).toHaveBeenCalledWith('Something broke', {
        duration: TOAST_DURATIONS.LONG,
      });
    });

    it('should extract message from Error objects', () => {
      const { result } = renderHook(() => useNotifications());

      act(() => {
        result.current.handleError(new Error('Validation failed'));
      });

      expect(mockToast.error).toHaveBeenCalledWith('Validation failed', {
        duration: TOAST_DURATIONS.LONG,
      });
    });

    it('should use fallback for unknown error types', () => {
      const { result } = renderHook(() => useNotifications());

      act(() => {
        result.current.handleError(null, 'Custom fallback');
      });

      expect(mockToast.error).toHaveBeenCalledWith('Custom fallback', {
        duration: TOAST_DURATIONS.LONG,
      });
    });

    it('should use GENERIC_ERROR when no fallback is provided', () => {
      const { result } = renderHook(() => useNotifications());

      act(() => {
        result.current.handleError(42);
      });

      expect(mockToast.error).toHaveBeenCalledWith(
        TOAST_MESSAGES.GENERIC_ERROR,
        { duration: TOAST_DURATIONS.LONG }
      );
    });

    it('should suppress technical TypeError messages', () => {
      const { result } = renderHook(() => useNotifications());
      const err = new TypeError(
        "Cannot read properties of undefined (reading 'foo')"
      );

      act(() => {
        result.current.handleError(err);
      });

      // Should fall through to GENERIC_ERROR since TypeError is technical
      expect(mockToast.error).toHaveBeenCalledWith(
        TOAST_MESSAGES.GENERIC_ERROR,
        { duration: TOAST_DURATIONS.LONG }
      );
    });

    it('should suppress errors with stack-trace-like messages', () => {
      const { result } = renderHook(() => useNotifications());
      const err = new Error('Failed at Object.<anonymous> at processQueue');

      act(() => {
        result.current.handleError(err);
      });

      expect(mockToast.error).toHaveBeenCalledWith(
        TOAST_MESSAGES.GENERIC_ERROR,
        { duration: TOAST_DURATIONS.LONG }
      );
    });

    it('should suppress very long error messages (>100 chars)', () => {
      const { result } = renderHook(() => useNotifications());
      const err = new Error('A'.repeat(101));

      act(() => {
        result.current.handleError(err);
      });

      expect(mockToast.error).toHaveBeenCalledWith(
        TOAST_MESSAGES.GENERIC_ERROR,
        { duration: TOAST_DURATIONS.LONG }
      );
    });

    it('should map network errors to NETWORK_ERROR message', () => {
      const { result } = renderHook(() => useNotifications());

      act(() => {
        result.current.handleError(new Error('Network request failed'));
      });

      expect(mockToast.error).toHaveBeenCalledWith(
        TOAST_MESSAGES.NETWORK_ERROR,
        { duration: TOAST_DURATIONS.LONG }
      );
    });

    it('should map rate limit errors to RATE_LIMIT message', () => {
      const { result } = renderHook(() => useNotifications());

      act(() => {
        result.current.handleError(new Error('Rate limit exceeded'));
      });

      expect(mockToast.error).toHaveBeenCalledWith(TOAST_MESSAGES.RATE_LIMIT, {
        duration: TOAST_DURATIONS.LONG,
      });
    });

    it('should map permission errors to PERMISSION_ERROR message', () => {
      const { result } = renderHook(() => useNotifications());

      act(() => {
        result.current.handleError(new Error('Permission denied'));
      });

      expect(mockToast.error).toHaveBeenCalledWith(
        TOAST_MESSAGES.PERMISSION_ERROR,
        { duration: TOAST_DURATIONS.LONG }
      );
    });

    it('should map session errors to SESSION_EXPIRED message', () => {
      const { result } = renderHook(() => useNotifications());

      act(() => {
        result.current.handleError(new Error('Session expired'));
      });

      expect(mockToast.error).toHaveBeenCalledWith(
        TOAST_MESSAGES.SESSION_EXPIRED,
        { duration: TOAST_DURATIONS.LONG }
      );
    });
  });

  // ---- Exposed references ----

  describe('exposed references', () => {
    it('should expose messages and durations constants', () => {
      const { result } = renderHook(() => useNotifications());

      expect(result.current.messages).toBe(TOAST_MESSAGES);
      expect(result.current.durations).toBe(TOAST_DURATIONS);
    });

    it('should expose the raw sonner toast for advanced use', () => {
      const { result } = renderHook(() => useNotifications());

      expect(result.current.toast).toBe(mockToast);
    });
  });
});
