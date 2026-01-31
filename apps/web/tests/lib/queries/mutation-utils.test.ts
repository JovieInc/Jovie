import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FetchError } from '@/lib/queries/fetch';
import {
  createMutationCallbacks,
  getErrorMessage,
  handleMutationError,
  handleMutationSuccess,
} from '@/lib/queries/mutation-utils';

// Mock sonner toast - must use factory function pattern for hoisting
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

// Mock Sentry - must use factory function pattern for hoisting
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

import * as Sentry from '@sentry/nextjs';
// Import the mocked modules for assertions
import { toast } from 'sonner';

describe('mutation-utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getErrorMessage', () => {
    it('returns specific message for 401 unauthorized', () => {
      const error = new FetchError('Unauthorized', 401);
      expect(getErrorMessage(error, 'Fallback')).toBe(
        'Please sign in to continue'
      );
    });

    it('returns specific message for 403 forbidden', () => {
      const error = new FetchError('Forbidden', 403);
      expect(getErrorMessage(error, 'Fallback')).toBe(
        'You do not have permission to do this'
      );
    });

    it('returns specific message for 404 not found', () => {
      const error = new FetchError('Not Found', 404);
      expect(getErrorMessage(error, 'Fallback')).toBe(
        'The requested resource was not found'
      );
    });

    it('returns specific message for 409 conflict', () => {
      const error = new FetchError('Conflict', 409);
      expect(getErrorMessage(error, 'Fallback')).toBe(
        'This was modified elsewhere. Please refresh.'
      );
    });

    it('returns specific message for 429 rate limit', () => {
      const error = new FetchError('Too Many Requests', 429);
      expect(getErrorMessage(error, 'Fallback')).toBe(
        'Too many requests. Please try again later.'
      );
    });

    it('returns generic message for 5xx server errors', () => {
      const error500 = new FetchError('Internal Server Error', 500);
      const error503 = new FetchError('Service Unavailable', 503);

      expect(getErrorMessage(error500, 'Fallback')).toBe(
        'Something went wrong. Please try again.'
      );
      expect(getErrorMessage(error503, 'Fallback')).toBe(
        'Something went wrong. Please try again.'
      );
    });

    it('returns error message for standard Error with message', () => {
      const error = new Error('Custom error message');
      expect(getErrorMessage(error, 'Fallback')).toBe('Custom error message');
    });

    it('returns error message for FetchError with unmapped status codes', () => {
      // FetchError with unmapped status returns the error's message (not fallback)
      // because FetchError extends Error and has a message property
      const error = new FetchError('Teapot', 418);
      expect(getErrorMessage(error, 'Could not brew coffee')).toBe('Teapot');
    });

    it('returns fallback for unknown error types', () => {
      expect(getErrorMessage('string error', 'Fallback')).toBe('Fallback');
      expect(getErrorMessage(null, 'Fallback')).toBe('Fallback');
      expect(getErrorMessage(undefined, 'Fallback')).toBe('Fallback');
      expect(getErrorMessage({ random: 'object' }, 'Fallback')).toBe(
        'Fallback'
      );
    });

    it('returns fallback for Error with empty message', () => {
      const error = new Error('');
      expect(getErrorMessage(error, 'Fallback')).toBe('Fallback');
    });
  });

  describe('handleMutationError', () => {
    it('shows toast with user-friendly error message', () => {
      const error = new FetchError('Unauthorized', 401);
      handleMutationError(error, 'Profile update failed');

      expect(toast.error).toHaveBeenCalledWith('Please sign in to continue');
    });

    it('shows toast with fallback message when error has no specific mapping', () => {
      const error = new Error('Unknown error');
      handleMutationError(error, 'Operation failed');

      expect(toast.error).toHaveBeenCalledWith('Unknown error');
    });

    it('captures exception in Sentry with proper tags', () => {
      const error = new FetchError('Server Error', 500);
      handleMutationError(error, 'Save failed');

      expect(Sentry.captureException).toHaveBeenCalledWith(error, {
        tags: {
          category: 'mutation',
          source: 'handleMutationError',
        },
        extra: expect.objectContaining({
          fallbackMessage: 'Save failed',
          userMessage: 'Something went wrong. Please try again.',
        }),
      });
    });

    it('includes custom context in Sentry extra data', () => {
      const error = new Error('Test error');
      handleMutationError(error, 'Failed', {
        userId: 'user-123',
        action: 'update_profile',
      });

      expect(Sentry.captureException).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          extra: expect.objectContaining({
            userId: 'user-123',
            action: 'update_profile',
          }),
        })
      );
    });

    it('adds breadcrumb for error trail', () => {
      const error = new Error('Breadcrumb test');
      handleMutationError(error, 'Operation failed');

      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
        category: 'mutation',
        message: 'Mutation Error: Operation failed',
        level: 'error',
        data: { error: 'Breadcrumb test' },
      });
    });

    it('handles non-Error objects in breadcrumb data', () => {
      handleMutationError('string error', 'Failed');

      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { error: 'string error' },
        })
      );
    });
  });

  describe('handleMutationSuccess', () => {
    it('shows success toast with provided message', () => {
      handleMutationSuccess('Profile updated successfully');

      expect(toast.success).toHaveBeenCalledWith(
        'Profile updated successfully'
      );
    });
  });

  describe('createMutationCallbacks', () => {
    it('returns onSuccess callback that shows success toast when message provided', () => {
      const callbacks = createMutationCallbacks({
        successMessage: 'Saved!',
        errorMessage: 'Failed to save',
      });

      callbacks.onSuccess();

      expect(toast.success).toHaveBeenCalledWith('Saved!');
    });

    it('returns onSuccess callback that skips toast when no message', () => {
      const callbacks = createMutationCallbacks({
        errorMessage: 'Failed',
      });

      callbacks.onSuccess();

      expect(toast.success).not.toHaveBeenCalled();
    });

    it('calls custom onSuccess handler after toast', () => {
      const customOnSuccess = vi.fn();
      const callbacks = createMutationCallbacks({
        successMessage: 'Done',
        errorMessage: 'Failed',
        onSuccess: customOnSuccess,
      });

      callbacks.onSuccess();

      expect(toast.success).toHaveBeenCalledWith('Done');
      expect(customOnSuccess).toHaveBeenCalled();
    });

    it('returns onError callback that handles errors', () => {
      const error = new FetchError('Server Error', 500);
      const callbacks = createMutationCallbacks({
        errorMessage: 'Save failed',
      });

      callbacks.onError(error);

      expect(toast.error).toHaveBeenCalledWith(
        'Something went wrong. Please try again.'
      );
      expect(Sentry.captureException).toHaveBeenCalled();
    });

    it('calls custom onError handler after toast', () => {
      const customOnError = vi.fn();
      const error = new Error('Test');
      const callbacks = createMutationCallbacks({
        errorMessage: 'Failed',
        onError: customOnError,
      });

      callbacks.onError(error);

      expect(customOnError).toHaveBeenCalledWith(error);
    });

    it('works correctly when used with mutation options spread', () => {
      const callbacks = createMutationCallbacks({
        successMessage: 'Created!',
        errorMessage: 'Creation failed',
      });

      // Simulate how it would be used in a mutation
      const mutationOptions = {
        mutationFn: vi.fn(),
        ...callbacks,
      };

      expect(mutationOptions.onSuccess).toBeDefined();
      expect(mutationOptions.onError).toBeDefined();

      // Verify the spread callbacks work
      mutationOptions.onSuccess();
      expect(toast.success).toHaveBeenCalledWith('Created!');
    });
  });
});
