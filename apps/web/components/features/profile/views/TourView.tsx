'use client';

import type { TourDateViewModel } from '@/lib/tour-dates/types';
import type { Artist } from '@/types/db';
import { TourDrawerContent } from '../TourModePanel';

export interface TourViewProps {
  readonly artist: Artist;
  readonly tourDates: TourDateViewModel[];
}

/**
 * Body of the `tour` mode: upcoming shows and ticket links.
 *
 * Pure view component — no title or shell. The enclosing wrapper owns chrome.
 */
export function TourView({ artist, tourDates }: TourViewProps) {
  return <TourDrawerContent artist={artist} tourDates={tourDates} />;
}
