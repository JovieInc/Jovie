'use client';

import { useMemo } from 'react';
import type { TourDateViewModel } from '@/app/app/dashboard/tour-dates/actions';
import { useUserLocation } from '@/hooks/useUserLocation';
import { calculateDistanceKm, NEAR_YOU_THRESHOLD_KM } from '@/lib/geo';
import { TourDateCard } from './TourDateCard';

interface TourDatesListProps {
  tourDates: TourDateViewModel[];
}

interface TourDateWithDistance extends TourDateViewModel {
  distanceKm: number | null;
  isNearYou: boolean;
}

/**
 * Client component that handles location-based sorting of tour dates.
 *
 * Performance considerations:
 * - Initial render shows dates in chronological order (server-provided)
 * - Location fetch happens in parallel, doesn't block render
 * - Sorting is memoized and only recalculated when location/dates change
 * - Haversine calculation is O(n) with ~microseconds per venue
 */
export function TourDatesList({ tourDates }: TourDatesListProps) {
  const { location, isLoading } = useUserLocation();

  const { sortedDates, nearbyCount } = useMemo(() => {
    // Calculate distances for all dates
    const datesWithDistance: TourDateWithDistance[] = tourDates.map(
      tourDate => {
        let distanceKm: number | null = null;
        let isNearYou = false;

        if (
          location &&
          tourDate.latitude != null &&
          tourDate.longitude != null
        ) {
          distanceKm = calculateDistanceKm(location, {
            latitude: tourDate.latitude,
            longitude: tourDate.longitude,
          });
          isNearYou = distanceKm <= NEAR_YOU_THRESHOLD_KM;
        }

        return {
          ...tourDate,
          distanceKm,
          isNearYou,
        };
      }
    );

    // If we don't have user location, keep chronological order
    if (!location) {
      return { sortedDates: datesWithDistance, nearbyCount: 0 };
    }

    // Separate "near you" dates from others
    const nearbyDates: TourDateWithDistance[] = [];
    const otherDates: TourDateWithDistance[] = [];

    for (const date of datesWithDistance) {
      if (date.isNearYou) {
        nearbyDates.push(date);
      } else {
        otherDates.push(date);
      }
    }

    // Sort nearby dates by distance (closest first)
    nearbyDates.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));

    // Other dates remain in chronological order (already sorted by server)
    return {
      sortedDates: [...nearbyDates, ...otherDates],
      nearbyCount: nearbyDates.length,
    };
  }, [tourDates, location]);

  return (
    <div className='space-y-4'>
      {nearbyCount > 0 && !isLoading && (
        <p className='text-sm text-secondary-token'>
          {nearbyCount} {nearbyCount === 1 ? 'show' : 'shows'} near you
        </p>
      )}
      {sortedDates.map(tourDate => (
        <TourDateCard
          key={tourDate.id}
          tourDate={tourDate}
          isNearYou={tourDate.isNearYou}
          distanceKm={tourDate.distanceKm}
        />
      ))}
    </div>
  );
}
