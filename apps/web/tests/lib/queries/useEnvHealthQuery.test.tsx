import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEnvHealthQuery } from '@/lib/queries';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('useEnvHealthQuery', () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
          retryDelay: 0,
        },
      },
    });
  });

  it('returns the env payload even when the endpoint responds unhealthy', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      json: () =>
        Promise.resolve({
          service: 'env',
          status: 'error',
          ok: false,
          timestamp: new Date().toISOString(),
          details: {
            environment: 'test',
            platform: 'darwin',
            nodeVersion: process.version,
            startupValidationCompleted: true,
            currentValidation: {
              valid: false,
              errors: ['Missing env var'],
              warnings: [],
              critical: [],
            },
            integrations: {
              database: false,
              auth: false,
              payments: false,
              images: false,
            },
          },
        }),
    });

    const { result } = renderHook(() => useEnvHealthQuery({ enabled: true }), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.ok).toBe(false);
    expect(result.current.data?.details.currentValidation.errors).toContain(
      'Missing env var'
    );
  });

  it('requests the canonical env health endpoint', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () =>
        Promise.resolve({
          service: 'env',
          status: 'ok',
          ok: true,
          timestamp: new Date().toISOString(),
          details: {
            environment: 'test',
            platform: 'darwin',
            nodeVersion: process.version,
            startupValidationCompleted: true,
            currentValidation: {
              valid: true,
              errors: [],
              warnings: [],
              critical: [],
            },
            integrations: {
              database: true,
              auth: true,
              payments: true,
              images: true,
            },
          },
        }),
    });

    renderHook(() => useEnvHealthQuery({ enabled: true }), { wrapper });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/health/env',
        expect.any(Object)
      );
    });
  });
});
