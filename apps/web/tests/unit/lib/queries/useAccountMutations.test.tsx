import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---- hoisted mocks ----
const {
  mockFetchWithTimeout,
  mockFetchWithTimeoutResponse,
  mockHandleMutationError,
  mockHandleMutationSuccess,
} = vi.hoisted(() => ({
  mockFetchWithTimeout: vi.fn(),
  mockFetchWithTimeoutResponse: vi.fn(),
  mockHandleMutationError: vi.fn(),
  mockHandleMutationSuccess: vi.fn(),
}));

vi.mock('@/lib/queries/fetch', () => ({
  fetchWithTimeout: mockFetchWithTimeout,
  fetchWithTimeoutResponse: mockFetchWithTimeoutResponse,
  createMutationFn: vi.fn(),
  createQueryFn: vi.fn(),
}));

vi.mock('@/lib/queries/keys', () => ({
  queryKeys: {
    billing: {
      all: ['billing'] as const,
      status: () => ['billing', 'status'] as const,
    },
    chat: {
      all: ['chat'] as const,
      conversations: () => ['chat', 'conversations'] as const,
      conversation: (id: string) => ['chat', 'conversation', id] as const,
      usage: () => ['chat', 'usage'] as const,
    },
    user: {
      all: ['user'] as const,
      profile: () => ['user', 'profile'] as const,
      settings: () => ['user', 'settings'] as const,
    },
  },
}));

vi.mock('@/lib/queries/mutation-utils', () => ({
  handleMutationError: mockHandleMutationError,
  handleMutationSuccess: mockHandleMutationSuccess,
}));

// ---- import after mocks ----
import { useDeleteAccountMutation, useExportDataMutation } from '@/lib/queries';

// ---- helpers ----
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
}

// ---- tests ----

describe('useDeleteAccountMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts in an idle state', () => {
    const { result } = renderHook(() => useDeleteAccountMutation(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isIdle).toBe(true);
    expect(result.current.isPending).toBe(false);
  });

  it('calls fetchWithTimeout with correct URL, method, and body on mutate', async () => {
    mockFetchWithTimeout.mockResolvedValueOnce({ success: true });

    const { result } = renderHook(() => useDeleteAccountMutation(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.mutate({ confirmation: 'DELETE' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockFetchWithTimeout).toHaveBeenCalledOnce();
    expect(mockFetchWithTimeout).toHaveBeenCalledWith('/api/account/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmation: 'DELETE' }),
    });
  });

  it('resolves with the API response data on success', async () => {
    const payload = { success: true };
    mockFetchWithTimeout.mockResolvedValueOnce(payload);

    const { result } = renderHook(() => useDeleteAccountMutation(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.mutate({ confirmation: 'DELETE' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(payload);
  });

  it('calls handleMutationSuccess with the correct toast message on success', async () => {
    mockFetchWithTimeout.mockResolvedValueOnce({ success: true });

    const { result } = renderHook(() => useDeleteAccountMutation(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.mutate({ confirmation: 'DELETE' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockHandleMutationSuccess).toHaveBeenCalledOnce();
    expect(mockHandleMutationSuccess).toHaveBeenCalledWith(
      'Account deleted. You will be signed out.'
    );
  });

  it('transitions to error state when fetchWithTimeout rejects', async () => {
    const error = new Error('Network failure');
    mockFetchWithTimeout.mockRejectedValueOnce(error);

    const { result } = renderHook(() => useDeleteAccountMutation(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.mutate({ confirmation: 'DELETE' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(error);
  });

  it('calls handleMutationError with the error and fallback message on failure', async () => {
    const error = new Error('Server error');
    mockFetchWithTimeout.mockRejectedValueOnce(error);

    const { result } = renderHook(() => useDeleteAccountMutation(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.mutate({ confirmation: 'DELETE' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(mockHandleMutationError).toHaveBeenCalledOnce();
    expect(mockHandleMutationError).toHaveBeenCalledWith(
      error,
      'Failed to delete account'
    );
  });
});

describe('useExportDataMutation', () => {
  // DOM helpers for the download anchor element
  let createObjectURLSpy: ReturnType<typeof vi.spyOn>;
  let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>;

  const fakeAnchor = {
    href: '',
    download: '',
    click: vi.fn(),
    remove: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Only intercept createElement('a') -- let React's own DOM calls through
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(
      (tag: string, options?: ElementCreationOptions) => {
        if (tag === 'a') return fakeAnchor as unknown as HTMLAnchorElement;
        return originalCreateElement(tag, options);
      }
    );

    // Spy on appendChild so it accepts our fake anchor without throwing
    const originalAppendChild = document.body.appendChild.bind(document.body);
    vi.spyOn(document.body, 'appendChild').mockImplementation(
      <T extends Node>(node: T): T => {
        if (node === (fakeAnchor as unknown)) return node;
        return originalAppendChild(node);
      }
    );

    createObjectURLSpy = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:http://localhost/fake');
    revokeObjectURLSpy = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => {});

    // Reset anchor state between tests
    fakeAnchor.href = '';
    fakeAnchor.download = '';
    fakeAnchor.click.mockClear();
    fakeAnchor.remove.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts in an idle state', () => {
    const { result } = renderHook(() => useExportDataMutation(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isIdle).toBe(true);
  });

  it('fetches /api/account/export, creates a blob download link, and cleans up', async () => {
    const fakeBlob = new Blob(['{}'], { type: 'application/json' });
    const mockResponse = {
      ok: true,
      blob: vi.fn().mockResolvedValue(fakeBlob),
    };
    mockFetchWithTimeoutResponse.mockResolvedValueOnce(mockResponse);

    const { result } = renderHook(() => useExportDataMutation(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.mutate();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Verify fetchWithTimeoutResponse was called with the export endpoint
    expect(mockFetchWithTimeoutResponse).toHaveBeenCalledWith(
      '/api/account/export'
    );

    // Verify blob download flow
    expect(mockResponse.blob).toHaveBeenCalled();
    expect(createObjectURLSpy).toHaveBeenCalledWith(fakeBlob);
    expect(document.createElement).toHaveBeenCalledWith('a');
    expect(fakeAnchor.href).toBe('blob:http://localhost/fake');
    expect(fakeAnchor.download).toMatch(
      /^jovie-data-export-\d{4}-\d{2}-\d{2}\.json$/
    );
    expect(fakeAnchor.click).toHaveBeenCalledOnce();
    expect(fakeAnchor.remove).toHaveBeenCalledOnce();
    expect(revokeObjectURLSpy).toHaveBeenCalledWith(
      'blob:http://localhost/fake'
    );
  });

  it('calls handleMutationSuccess after a successful export', async () => {
    const fakeBlob = new Blob(['{}']);
    mockFetchWithTimeoutResponse.mockResolvedValueOnce({
      ok: true,
      blob: vi.fn().mockResolvedValue(fakeBlob),
    });

    const { result } = renderHook(() => useExportDataMutation(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.mutate();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockHandleMutationSuccess).toHaveBeenCalledOnce();
    expect(mockHandleMutationSuccess).toHaveBeenCalledWith(
      'Data export downloaded'
    );
  });

  it('throws and transitions to error when the fetch response is not ok', async () => {
    // fetchWithTimeoutResponse throws FetchError when response is not ok,
    // but in the component it just calls response.blob() which would fail.
    // The component doesn't check ok — fetchWithTimeoutResponse itself
    // throws for non-ok responses. Simulate that behavior.
    mockFetchWithTimeoutResponse.mockRejectedValueOnce(
      new Error('Failed to export data')
    );

    const { result } = renderHook(() => useExportDataMutation(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.mutate();
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
    expect((result.current.error as Error)?.message).toBe(
      'Failed to export data'
    );
  });

  it('calls handleMutationError with fallback message on failure', async () => {
    mockFetchWithTimeoutResponse.mockRejectedValueOnce(
      new Error('Fetch failed')
    );

    const { result } = renderHook(() => useExportDataMutation(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.mutate();
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(mockHandleMutationError).toHaveBeenCalledOnce();
    expect(mockHandleMutationError).toHaveBeenCalledWith(
      expect.any(Error),
      'Failed to export data'
    );
  });

  it('handles a network-level fetch rejection gracefully', async () => {
    mockFetchWithTimeoutResponse.mockRejectedValueOnce(
      new TypeError('Failed to fetch')
    );

    const { result } = renderHook(() => useExportDataMutation(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.mutate();
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(TypeError);

    expect(mockHandleMutationError).toHaveBeenCalledOnce();
  });
});
