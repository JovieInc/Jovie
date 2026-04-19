'use client';

import { useTourDateProximity } from '@/hooks/useTourDateProximity';
import { useUserLocation } from '@/hooks/useUserLocation';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import { TourDateCard } from './TourDateCard';

interface TourDatesListProps {
  readonly tourDates: TourDateViewModel[];
  readonly handle: string;
}

/**
 * Client component that handles location-based sorting of tour dates.
 *
 * Uses density-aware proximity algorithm via useTourDateProximity hook.
 * Nearby dates appear first (sorted by distance), then remaining dates chronologically.
 */
export function TourDatesList({
  tourDates,
  handle,
}: Readonly<TourDatesListProps>) {
  const { location, isLoading, error } = useUserLocation();
  const { nearbyDates, allDates } = useTourDateProximity(tourDates, location);

  // On the public tour page, nearby dates sort to top (no duplication)
  const nearbyIds = new Set(nearbyDates.map(item => item.date.id));
  const remainingDates = allDates.filter(item => !nearbyIds.has(item.date.id));
  const sortedDates = [...nearbyDates, ...remainingDates];

  return (
    <div className='space-y-3'>
      {nearbyDates.length > 0 && !isLoading && (
        <p className='text-sm text-secondary-token'>
          {nearbyDates.length} {nearbyDates.length === 1 ? 'show' : 'shows'}{' '}
          near you
        </p>
      )}
      {error && !isLoading && nearbyDates.length === 0 && (
        <p className='text-sm text-tertiary-token'>
          Location unavailable — showing dates in chronological order
        </p>
      )}
      {sortedDates.map(item => (
        <TourDateCard
          key={item.date.id}
          tourDate={item.date}
          handle={handle}
          isNearYou={item.isNearby}
          distanceKm={
            item.distanceMiles != null ? item.distanceMiles / 0.621371 : null
          }
        />
      ))}
    </div>
  );
}
