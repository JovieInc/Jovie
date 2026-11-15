'use client';

import { ChatEntityPanelProvider } from '@/app/app/(shell)/chat/ChatEntityPanelContext';
import type { BandsintownConnectionStatus } from '@/app/app/(shell)/dashboard/tour-dates/actions';
import { TourDatesManager } from '@/components/features/dashboard/organisms/tour-dates';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import { TourDatesPageFrame } from './TourDatesPageFrame';

interface TourDatesPageClientProps {
  readonly profileId: string;
  readonly initialTourDates: TourDateViewModel[];
  readonly connectionStatus: BandsintownConnectionStatus;
}

/** Canonical tour-date entity surface inside the shared app shell. */
export function TourDatesPageClient({
  profileId,
  initialTourDates,
  connectionStatus,
}: Readonly<TourDatesPageClientProps>) {
  return (
    <ChatEntityPanelProvider resetKey={profileId}>
      <TourDatesPageFrame testId='tour-dates-page'>
        <h1 className='sr-only'>Tour Dates</h1>
        <TourDatesManager
          key={profileId}
          profileId={profileId}
          initialTourDates={initialTourDates}
          connectionStatus={connectionStatus}
        />
      </TourDatesPageFrame>
    </ChatEntityPanelProvider>
  );
}
