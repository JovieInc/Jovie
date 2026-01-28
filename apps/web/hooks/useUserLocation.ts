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

const LOCATION_CACHE_KEY = 'jovie_user_location';
const LOCATION_CACHE_EXPIRY_KEY = 'jovie_user_location_expiry';
const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const GEOLOCATION_TIMEOUT_MS = 5000; // 5 second timeout for fast UX

/**
 * Hook to get user's geolocation with caching and fast fallback.
 * Uses session storage to avoid repeated permission prompts.
 * Times out quickly to ensure the page remains responsive.
 */
export function useUserLocation(): UseUserLocationResult {
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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

    let timeoutId: ReturnType<typeof setTimeout>;
    let didTimeout = false;

    // Set a timeout to stop waiting and show default order
    timeoutId = setTimeout(() => {
      didTimeout = true;
      setError('Location request timed out');
      setIsLoading(false);
    }, GEOLOCATION_TIMEOUT_MS);

    navigator.geolocation.getCurrentPosition(
      position => {
        if (didTimeout) return;
        clearTimeout(timeoutId);

        const userLocation: UserLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };

        // Cache the location
        cacheLocation(userLocation);
        setLocation(userLocation);
        setIsLoading(false);
      },
      err => {
        if (didTimeout) return;
        clearTimeout(timeoutId);

        setError(err.message);
        setIsLoading(false);
      },
      {
        enableHighAccuracy: false, // Low accuracy is faster and sufficient for city-level
        timeout: GEOLOCATION_TIMEOUT_MS,
        maximumAge: CACHE_DURATION_MS, // Accept cached browser location
      }
    );

    return () => {
      clearTimeout(timeoutId);
    };
  }, []);

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
