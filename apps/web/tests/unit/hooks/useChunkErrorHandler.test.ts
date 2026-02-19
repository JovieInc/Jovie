import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockToast, mockCaptureException, mockFetchBuildInfo } = vi.hoisted(
  () => ({
    mockToast: Object.assign(vi.fn(), {
      warning: vi.fn(),
      error: vi.fn(),
      dismiss: vi.fn(),
    }),
    mockCaptureException: vi.fn(),
    mockFetchBuildInfo: vi.fn(),
  })
);

vi.mock('sonner', () => ({ toast: mockToast }));
vi.mock('@sentry/nextjs', () => ({ captureException: mockCaptureException }));
vi.mock('@/lib/hooks/useVersionMonitor', () => ({
  fetchBuildInfo: mockFetchBuildInfo,
}));

import { useChunkErrorHandler } from '@/lib/hooks/useChunkErrorHandler';

describe('useChunkErrorHandler', () => {
  const addEventListenerSpy = vi.spyOn(globalThis, 'addEventListener');
  const removeEventListenerSpy = vi.spyOn(globalThis, 'removeEventListener');

  // Store original location and mock reload
  const originalLocation = globalThis.location;
  const mockReload = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock location.reload
    Object.defineProperty(globalThis, 'location', {
      value: {
        ...originalLocation,
        reload: mockReload,
        href: 'http://localhost:3000/test',
      },
      writable: true,
      configurable: true,
    });
    // Default: fetchBuildInfo resolves with a known buildId
    mockFetchBuildInfo.mockResolvedValue({ buildId: 'abc123' });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });

  // Helper to dispatch a global error event with a given error object
  function dispatchErrorEvent(error: unknown) {
    const event = new ErrorEvent('error', { error });
    globalThis.dispatchEvent(event);
  }

  // Helper to dispatch an unhandled rejection event
  // PromiseRejectionEvent is not available in jsdom, so we create a custom Event
  function dispatchRejectionEvent(reason: unknown) {
    const event = new Event('unhandledrejection') as Event & {
      reason: unknown;
      promise: Promise<unknown>;
    };
    Object.defineProperty(event, 'reason', { value: reason });
    Object.defineProperty(event, 'promise', { value: Promise.resolve() });
    Object.defineProperty(event, 'preventDefault', {
      value: vi.fn(),
      writable: true,
    });
    globalThis.dispatchEvent(event);
  }

  // Helper to wait for async handlers to settle
  async function flushPromises() {
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  it('registers error and unhandledrejection listeners on mount', () => {
    renderHook(() => useChunkErrorHandler());

    expect(addEventListenerSpy).toHaveBeenCalledWith(
      'error',
      expect.any(Function)
    );
    expect(addEventListenerSpy).toHaveBeenCalledWith(
      'unhandledrejection',
      expect.any(Function)
    );
  });

  it('removes event listeners on unmount', () => {
    const { unmount } = renderHook(() => useChunkErrorHandler());
    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'error',
      expect.any(Function)
    );
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'unhandledrejection',
      expect.any(Function)
    );
  });

  it('detects ChunkLoadError by error name pattern', async () => {
    renderHook(() => useChunkErrorHandler());

    const error = new Error('Loading chunk 42 failed');
    dispatchErrorEvent(error);
    await flushPromises();

    expect(mockCaptureException).toHaveBeenCalledWith(error, {
      tags: {
        errorType: 'chunk_load_error',
        context: 'chunk_error_handler',
      },
      extra: {
        message: 'Loading chunk 42 failed',
        url: 'http://localhost:3000/test',
      },
    });
    expect(mockToast.warning).toHaveBeenCalledTimes(1);
  });

  it.each([
    'Loading chunk abc123 failed',
    'ChunkLoadError: loading chunk 7',
    'Loading CSS chunk abc failed',
    "Couldn't find required dependency",
    'Failed to fetch dynamically imported module /foo.js',
  ])('detects chunk error pattern: "%s"', async message => {
    renderHook(() => useChunkErrorHandler());

    dispatchErrorEvent(new Error(message));
    await flushPromises();

    expect(mockCaptureException).toHaveBeenCalled();
    expect(mockToast.warning).toHaveBeenCalled();
  });

  it('detects deployment reference errors and shows toast without Sentry report', async () => {
    renderHook(() => useChunkErrorHandler());

    const error = new ReferenceError('useState is not defined');
    dispatchErrorEvent(error);
    await flushPromises();

    // Deployment reference errors should NOT be reported to Sentry
    expect(mockCaptureException).not.toHaveBeenCalled();
    // But should still show toast
    expect(mockToast.warning).toHaveBeenCalledTimes(1);
  });

  it.each([
    'dynamic is not defined',
    'useVersionMonitor is not defined',
    'myStatsigEnabled is not defined',
    'checkVersionMismatch is not defined',
    'FREQUENT_CACHE is not defined',
  ])('detects deployment ReferenceError: "%s"', async message => {
    renderHook(() => useChunkErrorHandler());

    dispatchErrorEvent(new ReferenceError(message));
    await flushPromises();

    expect(mockToast.warning).toHaveBeenCalled();
  });

  it('ignores non-chunk regular errors', async () => {
    renderHook(() => useChunkErrorHandler());

    dispatchErrorEvent(new Error('Cannot read properties of undefined'));
    await flushPromises();

    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(mockToast.warning).not.toHaveBeenCalled();
  });

  it('ignores ReferenceErrors that are not deployment-related', async () => {
    renderHook(() => useChunkErrorHandler());

    dispatchErrorEvent(new ReferenceError('foo is not defined'));
    await flushPromises();

    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(mockToast.warning).not.toHaveBeenCalled();
  });

  it('shows "app has been updated" message when version info is available', async () => {
    mockFetchBuildInfo.mockResolvedValue({ buildId: 'new-build-456' });
    renderHook(() => useChunkErrorHandler());

    dispatchErrorEvent(new Error('Loading chunk 1 failed'));
    await flushPromises();

    expect(mockToast.warning).toHaveBeenCalledWith(
      'The app has been updated',
      expect.objectContaining({
        id: 'chunk-error',
        duration: Infinity,
        description: 'Please refresh to continue.',
        action: expect.objectContaining({ label: 'Refresh' }),
      })
    );
  });

  it('shows generic fallback message when version info is unknown', async () => {
    mockFetchBuildInfo.mockResolvedValue({ buildId: 'unknown' });
    renderHook(() => useChunkErrorHandler());

    dispatchErrorEvent(new Error('Loading chunk 1 failed'));
    await flushPromises();

    expect(mockToast.warning).toHaveBeenCalledWith(
      'Something went wrong loading the app',
      expect.objectContaining({
        id: 'chunk-error',
        description: 'Please refresh to continue.',
      })
    );
  });

  it('shows generic fallback when fetchBuildInfo returns null', async () => {
    mockFetchBuildInfo.mockResolvedValue(null);
    renderHook(() => useChunkErrorHandler());

    dispatchErrorEvent(new Error('Loading chunk 1 failed'));
    await flushPromises();

    expect(mockToast.warning).toHaveBeenCalledWith(
      'Something went wrong loading the app',
      expect.objectContaining({ id: 'chunk-error' })
    );
  });

  it('only shows toast once per session even with multiple errors', async () => {
    renderHook(() => useChunkErrorHandler());

    dispatchErrorEvent(new Error('Loading chunk 1 failed'));
    await flushPromises();

    dispatchErrorEvent(new Error('Loading chunk 2 failed'));
    await flushPromises();

    dispatchErrorEvent(new ReferenceError('useState is not defined'));
    await flushPromises();

    // Toast shown only once
    expect(mockToast.warning).toHaveBeenCalledTimes(1);
    // But Sentry should capture each chunk error (deployment ref errors excluded)
    expect(mockCaptureException).toHaveBeenCalledTimes(2);
  });

  it('triggers window.location.reload when refresh action is clicked', async () => {
    renderHook(() => useChunkErrorHandler());

    dispatchErrorEvent(new Error('Loading chunk 1 failed'));
    await flushPromises();

    // Extract the onClick handler from the toast call
    const toastCall = mockToast.warning.mock.calls[0];
    const options = toastCall[1] as { action: { onClick: () => void } };
    options.action.onClick();

    expect(mockReload).toHaveBeenCalledTimes(1);
  });

  it('handles unhandled promise rejections with chunk errors', async () => {
    renderHook(() => useChunkErrorHandler());

    dispatchRejectionEvent(
      new Error('Failed to fetch dynamically imported module /page.js')
    );
    await flushPromises();

    expect(mockCaptureException).toHaveBeenCalled();
    expect(mockToast.warning).toHaveBeenCalled();
  });

  it('handles unhandled promise rejections with deployment reference errors', async () => {
    renderHook(() => useChunkErrorHandler());

    dispatchRejectionEvent(new ReferenceError('dynamic is not defined'));
    await flushPromises();

    // Deployment ref errors via rejection should still show toast but not report to Sentry
    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(mockToast.warning).toHaveBeenCalled();
  });

  it('ignores unhandled rejections for non-chunk errors', async () => {
    renderHook(() => useChunkErrorHandler());

    dispatchRejectionEvent(new Error('Network request failed'));
    await flushPromises();

    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(mockToast.warning).not.toHaveBeenCalled();
  });

  it('handles null/undefined errors gracefully', async () => {
    renderHook(() => useChunkErrorHandler());

    dispatchErrorEvent(null);
    await flushPromises();

    dispatchErrorEvent(undefined);
    await flushPromises();

    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(mockToast.warning).not.toHaveBeenCalled();
  });
});
