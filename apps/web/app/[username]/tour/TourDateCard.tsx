'use client';

import {
  EntityCard,
  tourDateToEntityCard,
} from '@/components/organisms/entity-card';
import { useTourDateTicketClick } from '@/hooks/useTourDateTicketClick';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import { cn } from '@/lib/utils';

interface TourDateCardProps {
  readonly tourDate: TourDateViewModel;
  readonly handle: string;
  readonly isNearYou?: boolean;
  readonly distanceKm?: number | null;
}

export function TourDateCard({
  tourDate,
  handle,
  isNearYou = false,
  distanceKm,
}: Readonly<TourDateCardProps>) {
  const isCancelled = tourDate.ticketStatus === 'cancelled';
  const handleTicketClick = useTourDateTicketClick(
    handle,
    tourDate.id,
    tourDate.ticketUrl
  );

  const handleAddToCalendar = () => {
    globalThis.location.href = `/api/calendar/${tourDate.id}`;
  };

  const baseModel = tourDateToEntityCard(tourDate, { isNearYou, distanceKm });
  const canBuyTickets =
    Boolean(tourDate.ticketUrl) &&
    !isCancelled &&
    tourDate.ticketStatus !== 'sold_out';

  const model = {
    ...baseModel,
    cta: baseModel.cta
      ? {
          ...baseModel.cta,
          onClick: canBuyTickets ? handleTicketClick : handleAddToCalendar,
        }
      : null,
    secondaryCta: baseModel.secondaryCta
      ? {
          ...baseModel.secondaryCta,
          onClick: handleAddToCalendar,
        }
      : null,
  };

  return (
    <EntityCard
      model={model}
      treatment='big'
      surface='pearl'
      className={cn('w-full', isCancelled && 'opacity-60')}
      dataTestId='entity-card-show'
    />
  );
}
