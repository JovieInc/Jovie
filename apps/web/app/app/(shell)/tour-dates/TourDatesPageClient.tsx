'use client';

import { ChatEntityPanelProvider } from '@/app/app/(shell)/chat/ChatEntityPanelContext';
import type { BandsintownConnectionStatus } from '@/app/app/(shell)/dashboard/tour-dates/actions';
import { TourDatesManager } from '@/components/features/dashboard/organisms/tour-dates';
import { PageShell } from '@/components/organisms/PageShell';
import type { TourDateViewModel } from '@/lib/tour-dates/types';

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
      <PageShell
        surfaceMode='table'
        data-testid='tour-dates-page'
        contentClassName='min-h-0'
      >
        <h1 className='sr-only'>Tour Dates</h1>
        <TourDatesManager
          key={profileId}
          profileId={profileId}
          initialTourDates={initialTourDates}
          connectionStatus={connectionStatus}
        />
      </PageShell>
    </ChatEntityPanelProvider>
  );
}
