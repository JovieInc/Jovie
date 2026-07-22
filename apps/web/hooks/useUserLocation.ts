'use client';

import { useEffect, useState } from 'react';

export interface UserLocation {
  latitude: number;
  longitude: number;
}

interface UseUserLocationResult {
  location: UserLocation | null;
  isLoading: boolean;
  error: string | null;
}

export type UserLocationPermissionMode = 'request' | 'granted-only';

export interface UseUserLocationOptions {
  readonly enabled?: boolean;
  /**
   * `request` preserves the legacy behavior and may open the browser prompt.
   * `granted-only` may use a cached or already-granted location, but never
   * turns a `prompt` permission state into browser chrome on page entry.
   */
  readonly permissionMode?: UserLocationPermissionMode;
}

const LOCATION_CACHE_KEY = 'jovie_user_location';
const LOCATION_CACHE_EXPIRY_KEY = 'jovie_user_location_expiry';
const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const GEOLOCATION_TIMEOUT_MS = 5000; // 5 second timeout for fast UX

/**
 * Hook to get user's geolocation with caching and fast fallback.
 * Uses session storage to avoid repeated permission prompts.
 * Times out quickly to ensure the page remains responsive.
 */
export function useUserLocation({
  enabled = true,
  permissionMode = 'request',
}: UseUserLocationOptions = {}): UseUserLocationResult {
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setLocation(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    // Check for cached location first
    const cachedLocation = getCachedLocation();
    if (cachedLocation) {
      setLocation(cachedLocation);
      setIsLoading(false);
      return;
    }

    // Check if geolocation is supported
    if (!navigator.geolocation) {
      setError('Geolocation not supported');
      setIsLoading(false);
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let didTimeout = false;
    let cancelled = false;

    const requestCurrentPosition = () => {
      if (cancelled) return;

      // Set a timeout to stop waiting and show default order.
      timeoutId = setTimeout(() => {
        if (cancelled) return;
        didTimeout = true;
        setError('Location request timed out');
        setIsLoading(false);
      }, GEOLOCATION_TIMEOUT_MS);

      navigator.geolocation.getCurrentPosition(
        position => {
          if (cancelled || didTimeout) return;
          if (timeoutId) clearTimeout(timeoutId);

          const userLocation: UserLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };

          cacheLocation(userLocation);
          setLocation(userLocation);
          setIsLoading(false);
        },
        err => {
          if (cancelled || didTimeout) return;
          if (timeoutId) clearTimeout(timeoutId);

          setError(err.message);
          setIsLoading(false);
        },
        {
          enableHighAccuracy: false,
          timeout: GEOLOCATION_TIMEOUT_MS,
          maximumAge: CACHE_DURATION_MS,
        }
      );
    };

    if (permissionMode === 'granted-only') {
      // Permissions is not uniformly available on older Safari builds. In
      // that case, fail quietly to the deterministic date order rather than
      // risking a surprise browser prompt.
      if (!navigator.permissions?.query) {
        setIsLoading(false);
      } else {
        void navigator.permissions
          .query({ name: 'geolocation' })
          .then(permission => {
            if (cancelled) return;
            if (permission.state === 'granted') {
              requestCurrentPosition();
              return;
            }
            setIsLoading(false);
          })
          .catch(() => {
            if (!cancelled) setIsLoading(false);
          });
      }
    } else {
      requestCurrentPosition();
    }

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [enabled, permissionMode]);

  return { location, isLoading, error };
}

function getCachedLocation(): UserLocation | null {
  if (typeof window === 'undefined') return null;

  try {
    const expiry = sessionStorage.getItem(LOCATION_CACHE_EXPIRY_KEY);
    if (!expiry || Date.now() > parseInt(expiry, 10)) {
      return null;
    }

    const cached = sessionStorage.getItem(LOCATION_CACHE_KEY);
    if (!cached) return null;

    const parsed: unknown = JSON.parse(cached);

    // Validate cached data structure before use
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'latitude' in parsed &&
      'longitude' in parsed &&
      typeof (parsed as UserLocation).latitude === 'number' &&
      typeof (parsed as UserLocation).longitude === 'number'
    ) {
      return parsed as UserLocation;
    }

    return null;
  } catch {
    return null;
  }
}

function cacheLocation(location: UserLocation): void {
  if (typeof window === 'undefined') return;

  try {
    sessionStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify(location));
    sessionStorage.setItem(
      LOCATION_CACHE_EXPIRY_KEY,
      String(Date.now() + CACHE_DURATION_MS)
    );
  } catch {
    // Ignore storage errors
  }
}
