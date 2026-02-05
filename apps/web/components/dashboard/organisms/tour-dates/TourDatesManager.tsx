'use client';

import { Button } from '@jovie/ui';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import {
  type BandsintownConnectionStatus,
  loadTourDates,
  type TourDateViewModel,
} from '@/app/app/(shell)/dashboard/tour-dates/actions';
import { Icon } from '@/components/atoms/Icon';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog';
import {
  useDeleteTourDateMutation,
  useDisconnectBandsintownMutation,
  useSyncFromBandsintownMutation,
} from '@/lib/queries/useTourDateMutations';
import { cn } from '@/lib/utils';
import { TourDateSidebar } from './TourDateSidebar';
import { TourDatesEmptyState } from './TourDatesEmptyState';
import { TourDatesTable } from './TourDatesTable';

interface TourDatesManagerProps {
  readonly profileId: string;
  readonly initialTourDates: TourDateViewModel[];
  readonly connectionStatus: BandsintownConnectionStatus;
}

export function TourDatesManager({
  profileId,
  initialTourDates,
  connectionStatus,
}: Readonly<TourDatesManagerProps>) {
  const [tourDates, setTourDates] =
    useState<TourDateViewModel[]>(initialTourDates);
  const [selectedTourDate, setSelectedTourDate] =
    useState<TourDateViewModel | null>(null);
  const [isConnected, setIsConnected] = useState(connectionStatus.connected);
  const [hasApiKey, setHasApiKey] = useState(connectionStatus.hasApiKey);
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tourDateToDelete, setTourDateToDelete] = useState<string | null>(null);

  const syncMutation = useSyncFromBandsintownMutation(profileId);
  const disconnectMutation = useDisconnectBandsintownMutation(profileId);
  const deleteMutation = useDeleteTourDateMutation(profileId);

  const handleSync = useCallback(async () => {
    try {
      const result = await syncMutation.mutateAsync();
      if (result.success) {
        // Refresh local state with updated tour dates
        const refreshed = await loadTourDates();
        setTourDates(refreshed);
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch {
      toast.error('Failed to sync tour dates');
    }
  }, [syncMutation]);

  const handleDisconnectClick = useCallback(() => {
    setDisconnectDialogOpen(true);
  }, []);

  const handleDisconnectConfirm = useCallback(async () => {
    try {
      await disconnectMutation.mutateAsync();
      setIsConnected(false);
      setTourDates(prev => prev.filter(td => td.provider !== 'bandsintown'));
      // Clear selected tour date if it was from Bandsintown
      setSelectedTourDate(prev =>
        prev?.provider === 'bandsintown' ? null : prev
      );
      toast.success('Disconnected from Bandsintown');
    } catch {
      toast.error('Failed to disconnect');
    }
  }, [disconnectMutation]);

  const handleDeleteClick = useCallback((id: string) => {
    setTourDateToDelete(id);
    setDeleteDialogOpen(true);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!tourDateToDelete) return;

    const id = tourDateToDelete;
    // Optimistically remove from list
    const previousTourDates = tourDates;
    const previousSelectedTourDate = selectedTourDate;
    setTourDates(prev => prev.filter(td => td.id !== id));
    if (selectedTourDate?.id === id) {
      setSelectedTourDate(null);
    }

    try {
      await deleteMutation.mutateAsync(id);
      toast.success('Tour date deleted');
    } catch {
      // Rollback on error
      setTourDates(previousTourDates);
      setSelectedTourDate(previousSelectedTourDate);
      toast.error('Failed to delete tour date');
    }
  }, [tourDateToDelete, selectedTourDate, tourDates, deleteMutation]);

  const handleConnected = useCallback((newTourDates: TourDateViewModel[]) => {
    setTourDates(newTourDates);
    setIsConnected(true);
  }, []);

  const handleApiKeySaved = useCallback(() => {
    setHasApiKey(true);
  }, []);

  // Show empty state if:
  // 1. No API key configured (need to set up API key first), OR
  // 2. No tour dates and not connected (need to connect artist)
  if (!hasApiKey || (tourDates.length === 0 && !isConnected)) {
    return (
      <TourDatesEmptyState
        profileId={profileId}
        hasApiKey={hasApiKey}
        onConnected={handleConnected}
        onApiKeySaved={handleApiKeySaved}
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
                  className='h-4 w-4 text-teal-600 dark:text-teal-400'
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
                  className={cn(
                    'mr-1.5 h-4 w-4',
                    syncMutation.isPending && 'animate-spin'
                  )}
                />
                Sync
              </Button>
              <Button
                variant='ghost'
                size='sm'
                onClick={handleDisconnectClick}
                disabled={disconnectMutation.isPending}
                className='text-tertiary-token hover:text-secondary-token'
              >
                <Icon name='Unlink' className='mr-1.5 h-4 w-4' />
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
              onDelete={handleDeleteClick}
              onSync={isConnected ? handleSync : undefined}
              isSyncing={syncMutation.isPending}
            />
          ) : (
            <div className='flex flex-col items-center justify-center px-4 py-16 text-center sm:px-6'>
              <Icon name='CalendarX2' className='h-6 w-6 text-tertiary-token' />
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
                    className={cn(
                      'mr-1.5 h-4 w-4',
                      syncMutation.isPending && 'animate-spin'
                    )}
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

      {/* Confirm Dialogs */}
      <ConfirmDialog
        open={disconnectDialogOpen}
        onOpenChange={setDisconnectDialogOpen}
        title='Disconnect Bandsintown?'
        description='This will remove all synced tour dates. You can reconnect later to sync them again.'
        confirmLabel='Disconnect'
        variant='destructive'
        onConfirm={handleDisconnectConfirm}
        isLoading={disconnectMutation.isPending}
      />

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={open => {
          setDeleteDialogOpen(open);
          if (!open) setTourDateToDelete(null);
        }}
        title='Delete tour date?'
        description='This action cannot be undone. The tour date will be permanently removed.'
        confirmLabel='Delete'
        variant='destructive'
        onConfirm={handleDeleteConfirm}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
