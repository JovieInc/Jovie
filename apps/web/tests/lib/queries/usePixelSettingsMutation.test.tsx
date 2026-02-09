import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type PixelSettingsResponse,
  usePixelDeleteMutation,
  usePixelSettingsMutation,
} from '@/lib/queries/usePixelSettingsMutation';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

// Mock Sentry
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

import { toast } from 'sonner';

describe('usePixelSettingsMutation', () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });
  });

  describe('save mutation', () => {
    const mockResponse: PixelSettingsResponse = { success: true };

    it('sends PUT request with correct payload', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { result } = renderHook(() => usePixelSettingsMutation(), {
        wrapper,
      });

      result.current.mutate({
        facebookPixelId: '123456',
        facebookAccessToken: 'EAA_token',
        googleMeasurementId: 'G-XXXXXX',
        googleApiSecret: 'secret',
        tiktokPixelId: 'C123',
        tiktokAccessToken: 'tiktok_token',
        enabled: true,
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/dashboard/pixels',
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            facebookPixelId: '123456',
            facebookAccessToken: 'EAA_token',
            googleMeasurementId: 'G-XXXXXX',
            googleApiSecret: 'secret',
            tiktokPixelId: 'C123',
            tiktokAccessToken: 'tiktok_token',
            enabled: true,
          }),
        })
      );
    });

    it('shows success toast on save', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { result } = renderHook(() => usePixelSettingsMutation(), {
        wrapper,
      });

      result.current.mutate({
        facebookPixelId: '',
        facebookAccessToken: '',
        googleMeasurementId: '',
        googleApiSecret: '',
        tiktokPixelId: '',
        tiktokAccessToken: '',
        enabled: true,
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(toast.success).toHaveBeenCalledWith('Pixels saved');
    });

    it('shows error toast on save failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const { result } = renderHook(() => usePixelSettingsMutation(), {
        wrapper,
      });

      result.current.mutate({
        facebookPixelId: '',
        facebookAccessToken: '',
        googleMeasurementId: '',
        googleApiSecret: '',
        tiktokPixelId: '',
        tiktokAccessToken: '',
        enabled: true,
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(toast.error).toHaveBeenCalledWith(
        'Something went wrong. Please try again.'
      );
    });
  });

  describe('delete mutation', () => {
    const mockResponse: PixelSettingsResponse = { success: true };

    it('sends DELETE request for specific platform', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { result } = renderHook(() => usePixelDeleteMutation(), {
        wrapper,
      });

      result.current.mutate({ platform: 'facebook' });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/dashboard/pixels?platform=facebook',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });

    it('sends DELETE request without platform to delete all', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { result } = renderHook(() => usePixelDeleteMutation(), {
        wrapper,
      });

      result.current.mutate({});

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/dashboard/pixels',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });

    it('shows platform-specific success toast for facebook', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { result } = renderHook(() => usePixelDeleteMutation(), {
        wrapper,
      });

      result.current.mutate({ platform: 'facebook' });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(toast.success).toHaveBeenCalledWith('Facebook pixel cleared');
    });

    it('shows platform-specific success toast for google', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { result } = renderHook(() => usePixelDeleteMutation(), {
        wrapper,
      });

      result.current.mutate({ platform: 'google' });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(toast.success).toHaveBeenCalledWith('Google pixel cleared');
    });

    it('shows platform-specific success toast for tiktok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { result } = renderHook(() => usePixelDeleteMutation(), {
        wrapper,
      });

      result.current.mutate({ platform: 'tiktok' });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(toast.success).toHaveBeenCalledWith('Tiktok pixel cleared');
    });

    it('shows generic success toast when deleting all', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { result } = renderHook(() => usePixelDeleteMutation(), {
        wrapper,
      });

      result.current.mutate({});

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(toast.success).toHaveBeenCalledWith('All pixel settings deleted');
    });

    it('invalidates pixelSettings query on success', async () => {
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { result } = renderHook(() => usePixelDeleteMutation(), {
        wrapper,
      });

      result.current.mutate({ platform: 'google' });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['pixelSettings'],
      });
    });

    it('shows error toast on delete failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const { result } = renderHook(() => usePixelDeleteMutation(), {
        wrapper,
      });

      result.current.mutate({ platform: 'facebook' });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(toast.error).toHaveBeenCalledWith(
        'Something went wrong. Please try again.'
      );
    });

    it('shows unauthorized error toast on 401', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      const { result } = renderHook(() => usePixelDeleteMutation(), {
        wrapper,
      });

      result.current.mutate({ platform: 'tiktok' });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(toast.error).toHaveBeenCalledWith('Please sign in to continue');
    });

    it('shows not found error toast on 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const { result } = renderHook(() => usePixelDeleteMutation(), {
        wrapper,
      });

      result.current.mutate({ platform: 'facebook' });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(toast.error).toHaveBeenCalledWith(
        'The requested resource was not found'
      );
    });
  });
});
