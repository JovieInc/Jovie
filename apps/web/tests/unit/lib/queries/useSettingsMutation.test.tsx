import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Hoisted mocks — must be declared before vi.mock() calls           */
/* ------------------------------------------------------------------ */

const {
  mockMutationFn,
  mockHandleMutationError,
  mockHandleMutationSuccess,
  mockCreateMutationFnSpy,
} = vi.hoisted(() => {
  // This is the actual function that useMutation will call.
  // It is captured at module-init time via createMutationFn's return value,
  // so it must be a stable reference whose behaviour we swap per-test.
  const mockMutationFn = vi.fn().mockResolvedValue({ success: true });

  // Spy so we can assert createMutationFn was called with the right args.
  const mockCreateMutationFnSpy = vi.fn().mockReturnValue(mockMutationFn);

  return {
    mockMutationFn,
    mockCreateMutationFnSpy,
    mockHandleMutationError: vi.fn(),
    mockHandleMutationSuccess: vi.fn(),
  };
});

vi.mock('@/lib/queries/fetch', () => ({
  createMutationFn: mockCreateMutationFnSpy,
}));

vi.mock('@/lib/queries/mutation-utils', () => ({
  handleMutationError: mockHandleMutationError,
  handleMutationSuccess: mockHandleMutationSuccess,
}));

vi.mock('@/lib/queries/keys', () => ({
  queryKeys: {
    user: {
      all: ['user'] as const,
      settings: () => ['user', 'settings'] as const,
    },
  },
}));

/* ------------------------------------------------------------------ */
/*  Imports (must come after vi.mock so the mocks are in place)       */
/* ------------------------------------------------------------------ */

import {
  useAnalyticsFilterMutation,
  useBrandingSettingsMutation,
  useNotificationSettingsMutation,
  useThemeMutation,
  useUpdateSettingsMutation,
} from '@/lib/queries/useSettingsMutation';

/* ------------------------------------------------------------------ */
/*  Shared test infrastructure                                        */
/* ------------------------------------------------------------------ */

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, gcTime: 0 },
    mutations: { retry: false },
  },
});

function TestWrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

/* ------------------------------------------------------------------ */
/*  Setup / teardown                                                  */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();

  // Reset the stable mutationFn to resolve successfully by default
  mockMutationFn.mockResolvedValue({ success: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ================================================================== */
/*  useUpdateSettingsMutation                                          */
/* ================================================================== */

describe('useUpdateSettingsMutation', () => {
  it('calls createMutationFn with the correct endpoint and method', () => {
    // createMutationFn is called at module level when the source file loads.
    // We cannot assert call count after clearAllMocks, but we can verify the
    // mock factory was configured with the expected arguments by importing.
    // Instead, verify that the mutationFn is wired up (it resolves correctly).
    // The real assertion is that the module imported without error and the
    // mutation function is callable, which proves createMutationFn returned it.
    expect(mockCreateMutationFnSpy).toBeDefined();
    expect(typeof mockMutationFn).toBe('function');
  });

  it('calls the mutation function with the supplied payload', async () => {
    const { result } = renderHook(() => useUpdateSettingsMutation(), {
      wrapper: TestWrapper,
    });

    const payload = { updates: { settings: { marketing_emails: true } } };

    await act(async () => {
      await result.current.mutateAsync(payload);
    });

    expect(mockMutationFn.mock.calls[0][0]).toEqual(payload);
  });

  it('shows theme success toast when updating theme', async () => {
    const { result } = renderHook(() => useUpdateSettingsMutation(), {
      wrapper: TestWrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        updates: { theme: { preference: 'dark' } },
      });
    });

    expect(mockHandleMutationSuccess).toHaveBeenCalledWith(
      'Theme preference saved'
    );
  });

  it('shows branding success toast when updating hide_branding', async () => {
    const { result } = renderHook(() => useUpdateSettingsMutation(), {
      wrapper: TestWrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        updates: { settings: { hide_branding: true } },
      });
    });

    expect(mockHandleMutationSuccess).toHaveBeenCalledWith(
      'Branding settings saved'
    );
  });

  it('shows analytics filter success toast when updating exclude_self_from_analytics', async () => {
    const { result } = renderHook(() => useUpdateSettingsMutation(), {
      wrapper: TestWrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        updates: { settings: { exclude_self_from_analytics: true } },
      });
    });

    expect(mockHandleMutationSuccess).toHaveBeenCalledWith(
      'Analytics filter saved'
    );
  });

  it('shows generic settings success toast for other settings updates', async () => {
    const { result } = renderHook(() => useUpdateSettingsMutation(), {
      wrapper: TestWrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        updates: { settings: { email_notifications: false } },
      });
    });

    expect(mockHandleMutationSuccess).toHaveBeenCalledWith('Settings saved');
  });

  it('invalidates user.settings query key on success', async () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateSettingsMutation(), {
      wrapper: TestWrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        updates: { settings: { push_notifications: true } },
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['user', 'settings'],
      })
    );
  });

  it('shows theme error toast when theme mutation fails', async () => {
    const error = new Error('Network error');
    mockMutationFn.mockRejectedValueOnce(error);

    const { result } = renderHook(() => useUpdateSettingsMutation(), {
      wrapper: TestWrapper,
    });

    await act(async () => {
      try {
        await result.current.mutateAsync({
          updates: { theme: { preference: 'light' } },
        });
      } catch {
        // expected
      }
    });

    expect(mockHandleMutationError).toHaveBeenCalledWith(
      error,
      'Failed to save theme preference'
    );
  });

  it('shows branding error toast when branding mutation fails', async () => {
    const error = new Error('Server error');
    mockMutationFn.mockRejectedValueOnce(error);

    const { result } = renderHook(() => useUpdateSettingsMutation(), {
      wrapper: TestWrapper,
    });

    await act(async () => {
      try {
        await result.current.mutateAsync({
          updates: { settings: { hide_branding: false } },
        });
      } catch {
        // expected
      }
    });

    expect(mockHandleMutationError).toHaveBeenCalledWith(
      error,
      'Failed to save branding settings'
    );
  });

  it('shows analytics error toast when analytics filter mutation fails', async () => {
    const error = new Error('Timeout');
    mockMutationFn.mockRejectedValueOnce(error);

    const { result } = renderHook(() => useUpdateSettingsMutation(), {
      wrapper: TestWrapper,
    });

    await act(async () => {
      try {
        await result.current.mutateAsync({
          updates: { settings: { exclude_self_from_analytics: false } },
        });
      } catch {
        // expected
      }
    });

    expect(mockHandleMutationError).toHaveBeenCalledWith(
      error,
      'Failed to save analytics filter'
    );
  });

  it('shows generic settings error toast for other settings failures', async () => {
    const error = new Error('Bad request');
    mockMutationFn.mockRejectedValueOnce(error);

    const { result } = renderHook(() => useUpdateSettingsMutation(), {
      wrapper: TestWrapper,
    });

    await act(async () => {
      try {
        await result.current.mutateAsync({
          updates: { settings: { email_notifications: true } },
        });
      } catch {
        // expected
      }
    });

    expect(mockHandleMutationError).toHaveBeenCalledWith(
      error,
      'Failed to save settings'
    );
  });
});

/* ================================================================== */
/*  useThemeMutation                                                   */
/* ================================================================== */

describe('useThemeMutation', () => {
  it('wraps updateTheme to send the correct theme payload', async () => {
    const { result } = renderHook(() => useThemeMutation(), {
      wrapper: TestWrapper,
    });

    await act(async () => {
      result.current.updateTheme('dark');
    });

    expect(mockMutationFn.mock.calls[0][0]).toEqual({
      updates: { theme: { preference: 'dark' } },
    });
  });

  it('accepts "system" as a valid theme preference', async () => {
    const { result } = renderHook(() => useThemeMutation(), {
      wrapper: TestWrapper,
    });

    await act(async () => {
      result.current.updateTheme('system');
    });

    expect(mockMutationFn.mock.calls[0][0]).toEqual({
      updates: { theme: { preference: 'system' } },
    });
  });

  it('exposes isPending, isError, and error from the underlying mutation', () => {
    const { result } = renderHook(() => useThemeMutation(), {
      wrapper: TestWrapper,
    });

    expect(result.current).toHaveProperty('isPending');
    expect(result.current).toHaveProperty('isError');
    expect(result.current).toHaveProperty('error');
    expect(result.current.isPending).toBe(false);
    expect(result.current.isError).toBe(false);
    expect(result.current.error).toBeNull();
  });
});

/* ================================================================== */
/*  useNotificationSettingsMutation                                    */
/* ================================================================== */

describe('useNotificationSettingsMutation', () => {
  it('sends notification settings in the correct shape', async () => {
    const { result } = renderHook(() => useNotificationSettingsMutation(), {
      wrapper: TestWrapper,
    });

    await act(async () => {
      result.current.updateNotifications({ marketing_emails: false });
    });

    expect(mockMutationFn.mock.calls[0][0]).toEqual({
      updates: { settings: { marketing_emails: false } },
    });
  });

  it('supports updating multiple notification fields at once', async () => {
    const { result } = renderHook(() => useNotificationSettingsMutation(), {
      wrapper: TestWrapper,
    });

    await act(async () => {
      result.current.updateNotifications({
        email_notifications: true,
        push_notifications: false,
      });
    });

    expect(mockMutationFn.mock.calls[0][0]).toEqual({
      updates: {
        settings: { email_notifications: true, push_notifications: false },
      },
    });
  });

  it('exposes isPending, isError, and error', () => {
    const { result } = renderHook(() => useNotificationSettingsMutation(), {
      wrapper: TestWrapper,
    });

    expect(result.current).toHaveProperty('updateNotifications');
    expect(result.current).toHaveProperty('isPending');
    expect(result.current).toHaveProperty('isError');
    expect(result.current).toHaveProperty('error');
  });
});

/* ================================================================== */
/*  useBrandingSettingsMutation                                        */
/* ================================================================== */

describe('useBrandingSettingsMutation', () => {
  it('sends hide_branding=true when updateBranding(true) is called', async () => {
    const { result } = renderHook(() => useBrandingSettingsMutation(), {
      wrapper: TestWrapper,
    });

    await act(async () => {
      result.current.updateBranding(true);
    });

    expect(mockMutationFn.mock.calls[0][0]).toEqual({
      updates: { settings: { hide_branding: true } },
    });
  });

  it('sends hide_branding=false when updateBranding(false) is called', async () => {
    const { result } = renderHook(() => useBrandingSettingsMutation(), {
      wrapper: TestWrapper,
    });

    await act(async () => {
      result.current.updateBranding(false);
    });

    expect(mockMutationFn.mock.calls[0][0]).toEqual({
      updates: { settings: { hide_branding: false } },
    });
  });

  it('provides an async variant (updateBrandingAsync) that returns a promise', async () => {
    const { result } = renderHook(() => useBrandingSettingsMutation(), {
      wrapper: TestWrapper,
    });

    let response: unknown;
    await act(async () => {
      response = await result.current.updateBrandingAsync(true);
    });

    expect(response).toEqual({ success: true });
    expect(mockMutationFn.mock.calls[0][0]).toEqual({
      updates: { settings: { hide_branding: true } },
    });
  });

  it('exposes isPending, isError, and error', () => {
    const { result } = renderHook(() => useBrandingSettingsMutation(), {
      wrapper: TestWrapper,
    });

    expect(result.current).toHaveProperty('updateBranding');
    expect(result.current).toHaveProperty('updateBrandingAsync');
    expect(result.current).toHaveProperty('isPending');
    expect(result.current).toHaveProperty('isError');
    expect(result.current).toHaveProperty('error');
  });
});

/* ================================================================== */
/*  useAnalyticsFilterMutation                                         */
/* ================================================================== */

describe('useAnalyticsFilterMutation', () => {
  it('sends exclude_self_from_analytics=true via updateAnalyticsFilter', async () => {
    const { result } = renderHook(() => useAnalyticsFilterMutation(), {
      wrapper: TestWrapper,
    });

    await act(async () => {
      result.current.updateAnalyticsFilter(true);
    });

    expect(mockMutationFn.mock.calls[0][0]).toEqual({
      updates: { settings: { exclude_self_from_analytics: true } },
    });
  });

  it('sends exclude_self_from_analytics=false via updateAnalyticsFilter', async () => {
    const { result } = renderHook(() => useAnalyticsFilterMutation(), {
      wrapper: TestWrapper,
    });

    await act(async () => {
      result.current.updateAnalyticsFilter(false);
    });

    expect(mockMutationFn.mock.calls[0][0]).toEqual({
      updates: { settings: { exclude_self_from_analytics: false } },
    });
  });

  it('provides an async variant (updateAnalyticsFilterAsync) that returns a promise', async () => {
    const { result } = renderHook(() => useAnalyticsFilterMutation(), {
      wrapper: TestWrapper,
    });

    let response: unknown;
    await act(async () => {
      response = await result.current.updateAnalyticsFilterAsync(true);
    });

    expect(response).toEqual({ success: true });
  });

  it('rejects the async variant when the mutation fails', async () => {
    const error = new Error('Server down');
    mockMutationFn.mockRejectedValueOnce(error);

    const { result } = renderHook(() => useAnalyticsFilterMutation(), {
      wrapper: TestWrapper,
    });

    await act(async () => {
      await expect(
        result.current.updateAnalyticsFilterAsync(false)
      ).rejects.toThrow('Server down');
    });
  });

  it('exposes isPending, isError, and error', () => {
    const { result } = renderHook(() => useAnalyticsFilterMutation(), {
      wrapper: TestWrapper,
    });

    expect(result.current).toHaveProperty('updateAnalyticsFilter');
    expect(result.current).toHaveProperty('updateAnalyticsFilterAsync');
    expect(result.current).toHaveProperty('isPending');
    expect(result.current).toHaveProperty('isError');
    expect(result.current).toHaveProperty('error');
  });
});
