'use client';

import { useMemo } from 'react';
import type { UserLocation } from '@/hooks/useUserLocation';
import {
  type Coordinates,
  calculateLocalNearbyRadius,
  isNearUser,
} from '@/lib/geo';
import type { TourDateViewModel } from '@/lib/tour-dates/types';

export interface TourDateWithProximity {
  readonly date: TourDateViewModel;
  readonly distanceMiles: number | null;
  readonly isNearby: boolean;
}

interface UseTourDateProximityResult {
  readonly nearbyDates: TourDateWithProximity[];
  readonly allDates: TourDateWithProximity[];
  readonly radiusMiles: number | null;
}

/**
 * Shared hook for density-aware tour date proximity classification.
 *
 * Returns nearby dates (sorted by distance) and all dates (sorted chronologically).
 * Nearby dates also appear in allDates for complete tour routing.
 */
export function useTourDateProximity(
  tourDates: TourDateViewModel[],
  location: UserLocation | null
): UseTourDateProximityResult {
  return useMemo(() => {
    if (tourDates.length === 0) {
      return { nearbyDates: [], allDates: [], radiusMiles: null };
    }

    if (!location) {
      const allDates: TourDateWithProximity[] = [...tourDates]
        .sort(
          (a, b) =>
            new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
        )
        .map(date => ({
          date,
          distanceMiles: null,
          isNearby: false,
        }));
      return { nearbyDates: [], allDates, radiusMiles: null };
    }

    // Collect venue coordinates for density calculation
    const venueCoords: Coordinates[] = [];
    for (let i = 0; i < tourDates.length; i++) {
      const td = tourDates[i];
      if (td.latitude != null && td.longitude != null) {
        venueCoords.push({ latitude: td.latitude, longitude: td.longitude });
      }
    }

    const radiusMiles =
      venueCoords.length > 0
        ? calculateLocalNearbyRadius(location, venueCoords)
        : null;

    // Classify each date
    const withProximity: TourDateWithProximity[] = tourDates.map(date => {
      if (
        radiusMiles != null &&
        date.latitude != null &&
        date.longitude != null
      ) {
        const result = isNearUser(
          location,
          { latitude: date.latitude, longitude: date.longitude },
          radiusMiles
        );
        return {
          date,
          distanceMiles: result.distanceMiles,
          isNearby: result.isNearby,
        };
      }
      return { date, distanceMiles: null, isNearby: false };
    });

    // Nearby dates sorted by distance (closest first)
    const nearbyDates = withProximity
      .filter(item => item.isNearby)
      .sort((a, b) => (a.distanceMiles ?? 0) - (b.distanceMiles ?? 0));

    // All dates sorted chronologically (includes nearby dates for routing completeness)
    const allDates = [...withProximity].sort(
      (a, b) =>
        new Date(a.date.startDate).getTime() -
        new Date(b.date.startDate).getTime()
    );

    return { nearbyDates, allDates, radiusMiles };
  }, [tourDates, location]);
}
