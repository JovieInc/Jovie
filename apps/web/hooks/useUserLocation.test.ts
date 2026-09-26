import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUserLocation } from './useUserLocation';

const CACHE_KEY = 'jovie_user_location';
const CACHE_EXPIRY_KEY = 'jovie_user_location_expiry';

function installNavigator({
  geolocation = true,
  permissions = true,
  permissionState = 'prompt',
}: Readonly<{
  geolocation?: boolean;
  permissions?: boolean;
  permissionState?: PermissionState;
}> = {}) {
  const getCurrentPosition = vi.fn();
  const query = vi.fn().mockResolvedValue({ state: permissionState });

  vi.stubGlobal('navigator', {
    geolocation: geolocation ? { getCurrentPosition } : undefined,
    permissions: permissions ? { query } : undefined,
  });

  return { getCurrentPosition, query };
}

describe('useUserLocation permission modes', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it('uses a valid cached location without consulting browser permissions', async () => {
    const { getCurrentPosition, query } = installNavigator({
      permissionState: 'prompt',
    });
    sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ latitude: 34.0522, longitude: -118.2437 })
    );
    sessionStorage.setItem(CACHE_EXPIRY_KEY, String(Date.now() + 60_000));

    const { result } = renderHook(() =>
      useUserLocation({ permissionMode: 'granted-only' })
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.location).toEqual({
      latitude: 34.0522,
      longitude: -118.2437,
    });
    expect(query).not.toHaveBeenCalled();
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it.each([
    'prompt',
    'denied',
  ] as const)('never opens geolocation when granted-only permission is %s', async permissionState => {
    const { getCurrentPosition, query } = installNavigator({
      permissionState,
    });

    const { result } = renderHook(() =>
      useUserLocation({ permissionMode: 'granted-only' })
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(query).toHaveBeenCalledWith({ name: 'geolocation' });
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(result.current.location).toBeNull();
  });

  it('reads location when permission was already granted', async () => {
    const { getCurrentPosition } = installNavigator({
      permissionState: 'granted',
    });
    getCurrentPosition.mockImplementation(success => {
      success({
        coords: { latitude: 51.5072, longitude: -0.1276 },
      } as GeolocationPosition);
    });

    const { result } = renderHook(() =>
      useUserLocation({ permissionMode: 'granted-only' })
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(result.current.location).toEqual({
      latitude: 51.5072,
      longitude: -0.1276,
    });
  });

  it('preserves request mode for consumers that intentionally ask permission', async () => {
    const { getCurrentPosition, query } = installNavigator({
      permissionState: 'prompt',
    });
    getCurrentPosition.mockImplementation(success => {
      success({
        coords: { latitude: 40.7128, longitude: -74.006 },
      } as GeolocationPosition);
    });

    const { result } = renderHook(() => useUserLocation());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(query).not.toHaveBeenCalled();
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it('falls back without prompting when Permissions API is unavailable', async () => {
    const { getCurrentPosition } = installNavigator({ permissions: false });

    const { result } = renderHook(() =>
      useUserLocation({ permissionMode: 'granted-only' })
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(result.current.location).toBeNull();
  });

  it('reports unsupported geolocation without attempting permission lookup', async () => {
    const { getCurrentPosition, query } = installNavigator({
      geolocation: false,
    });

    const { result } = renderHook(() =>
      useUserLocation({ permissionMode: 'granted-only' })
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe('Geolocation not supported');
    expect(query).not.toHaveBeenCalled();
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('stops waiting after the fixed timeout when granted geolocation stalls', async () => {
    vi.useFakeTimers();
    const { getCurrentPosition } = installNavigator({
      permissionState: 'granted',
    });

    const { result } = renderHook(() =>
      useUserLocation({ permissionMode: 'granted-only' })
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBe('Location request timed out');
    expect(result.current.location).toBeNull();
  });
});
