'use client';

import { Button } from '@jovie/ui';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import type {
  BandsintownConnectionStatus,
  TourDateViewModel,
} from '@/app/app/dashboard/tour-dates/actions';
import { Icon } from '@/components/atoms/Icon';
import {
  useDisconnectBandsintownMutation,
  useSyncFromBandsintownMutation,
} from '@/lib/queries/useTourDateMutations';
import { TourDateSidebar } from './TourDateSidebar';
import { TourDatesEmptyState } from './TourDatesEmptyState';
import { TourDatesTable } from './TourDatesTable';

interface TourDatesManagerProps {
  profileId: string;
  initialTourDates: TourDateViewModel[];
  connectionStatus: BandsintownConnectionStatus;
}

export function TourDatesManager({
  profileId,
  initialTourDates,
  connectionStatus,
}: TourDatesManagerProps) {
  const [tourDates, setTourDates] =
    useState<TourDateViewModel[]>(initialTourDates);
  const [selectedTourDate, setSelectedTourDate] =
    useState<TourDateViewModel | null>(null);
  const [isConnected, setIsConnected] = useState(connectionStatus.connected);

  const syncMutation = useSyncFromBandsintownMutation(profileId);
  const disconnectMutation = useDisconnectBandsintownMutation(profileId);

  const handleSync = useCallback(async () => {
    try {
      const result = await syncMutation.mutateAsync();
      if (result.success) {
        toast.success(result.message);
        // Reload page to get fresh data
        window.location.reload();
      } else {
        toast.error(result.message);
      }
    } catch {
      toast.error('Failed to sync tour dates');
    }
  }, [syncMutation]);

  const handleDisconnect = useCallback(async () => {
    if (
      !confirm(
        'Are you sure you want to disconnect Bandsintown? This will remove all synced tour dates.'
      )
    ) {
      return;
    }

    try {
      await disconnectMutation.mutateAsync();
      setIsConnected(false);
      setTourDates(prev => prev.filter(td => td.provider !== 'bandsintown'));
      toast.success('Disconnected from Bandsintown');
    } catch {
      toast.error('Failed to disconnect');
    }
  }, [disconnectMutation]);

  const handleDelete = useCallback(
    async (id: string) => {
      // Optimistically remove from list
      setTourDates(prev => prev.filter(td => td.id !== id));
      if (selectedTourDate?.id === id) {
        setSelectedTourDate(null);
      }
    },
    [selectedTourDate]
  );

  const handleConnected = useCallback((newTourDates: TourDateViewModel[]) => {
    setTourDates(newTourDates);
    setIsConnected(true);
  }, []);

  // Show empty state if no tour dates and not connected
  if (tourDates.length === 0 && !isConnected) {
    return (
      <TourDatesEmptyState
        profileId={profileId}
        onConnected={handleConnected}
      />
    );
  }

  return (
    <div className='flex h-full'>
      {/* Main content */}
      <div className='flex-1 overflow-hidden'>
        {/* Header with connection status */}
        {isConnected && connectionStatus.artistName && (
          <div className='flex items-center justify-between border-b border-subtle bg-surface-1 px-4 py-2'>
            <div className='flex items-center gap-2'>
              <div className='flex h-6 w-6 items-center justify-center rounded-full bg-teal-100 dark:bg-teal-900/30'>
                <Icon
                  name='Check'
                  className='h-3.5 w-3.5 text-teal-600 dark:text-teal-400'
                />
              </div>
              <span className='text-sm text-secondary-token'>
                Connected to{' '}
                <span className='font-medium text-primary-token'>
                  {connectionStatus.artistName}
                </span>{' '}
                on Bandsintown
              </span>
            </div>
            <div className='flex items-center gap-2'>
              <Button
                variant='ghost'
                size='sm'
                onClick={handleSync}
                disabled={syncMutation.isPending}
              >
                <Icon
                  name='RefreshCw'
                  className={`mr-1.5 h-3.5 w-3.5 ${syncMutation.isPending ? 'animate-spin' : ''}`}
                />
                Sync
              </Button>
              <Button
                variant='ghost'
                size='sm'
                onClick={handleDisconnect}
                disabled={disconnectMutation.isPending}
                className='text-tertiary-token hover:text-secondary-token'
              >
                <Icon name='Unlink' className='mr-1.5 h-3.5 w-3.5' />
                Disconnect
              </Button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className='h-full overflow-auto'>
          {tourDates.length > 0 ? (
            <TourDatesTable
              tourDates={tourDates}
              onEdit={setSelectedTourDate}
              onDelete={handleDelete}
              onSync={isConnected ? handleSync : undefined}
              isSyncing={syncMutation.isPending}
            />
          ) : (
            <div className='flex flex-col items-center justify-center py-16 text-center'>
              <Icon
                name='CalendarX2'
                className='h-12 w-12 text-tertiary-token'
              />
              <p className='mt-4 text-sm text-secondary-token'>
                No tour dates found
              </p>
              {isConnected && (
                <Button
                  variant='outline'
                  size='sm'
                  onClick={handleSync}
                  disabled={syncMutation.isPending}
                  className='mt-4'
                >
                  <Icon
                    name='RefreshCw'
                    className={`mr-1.5 h-3.5 w-3.5 ${syncMutation.isPending ? 'animate-spin' : ''}`}
                  />
                  Sync from Bandsintown
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sidebar */}
      {selectedTourDate && (
        <div className='w-80 shrink-0'>
          <TourDateSidebar
            tourDate={selectedTourDate}
            profileId={profileId}
            onClose={() => setSelectedTourDate(null)}
          />
        </div>
      )}
    </div>
  );
}
