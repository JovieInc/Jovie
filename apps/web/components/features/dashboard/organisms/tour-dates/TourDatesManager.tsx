'use client';

import { Button } from '@jovie/ui';
import { useCallback, useMemo, useState } from 'react';
import { useChatEntityPanel } from '@/app/app/(shell)/chat/ChatEntityPanelContext';
import {
  type BandsintownConnectionStatus,
  loadTourDates,
} from '@/app/app/(shell)/dashboard/tour-dates/actions';
import { Icon } from '@/components/atoms/Icon';
import { toast } from '@/components/feedback';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';
import {
  useDeleteTourDateMutation,
  useDisconnectBandsintownMutation,
  useSyncFromBandsintownMutation,
} from '@/lib/queries';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
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
  const [isConnected, setIsConnected] = useState(connectionStatus.connected);
  const [hasApiKey, setHasApiKey] = useState(connectionStatus.hasApiKey);
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tourDateToDelete, setTourDateToDelete] = useState<string | null>(null);

  const syncMutation = useSyncFromBandsintownMutation(profileId);
  const disconnectMutation = useDisconnectBandsintownMutation(profileId);
  const deleteMutation = useDeleteTourDateMutation(profileId);
  const {
    target: entityPanelTarget,
    open: openEntityPanel,
    close: closeEntityPanel,
  } = useChatEntityPanel();

  const selectedTourDate = useMemo(() => {
    if (entityPanelTarget?.kind !== 'tour-date') return null;
    return (
      tourDates.find(tourDate => tourDate.id === entityPanelTarget.id) ?? null
    );
  }, [entityPanelTarget, tourDates]);

  const handleSelectTourDate = useCallback(
    (tourDate: TourDateViewModel) => {
      openEntityPanel({
        kind: 'tour-date',
        id: tourDate.id,
        label: tourDate.title?.trim() || tourDate.venueName,
        source: 'manual',
        focusKey: `tour-date:${tourDate.id}`,
      });
    },
    [openEntityPanel]
  );

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
      if (selectedTourDate?.provider === 'bandsintown') {
        closeEntityPanel();
      }
      toast.success('Disconnected from Bandsintown'); // ui-casing-allow: Bandsintown brand name
    } catch {
      toast.error('Failed to disconnect');
    }
  }, [closeEntityPanel, disconnectMutation, selectedTourDate]);

  const handleDeleteClick = useCallback((id: string) => {
    setTourDateToDelete(id);
    setDeleteDialogOpen(true);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!tourDateToDelete) return;

    const id = tourDateToDelete;
    // Optimistically remove from list
    const previousTourDates = tourDates;
    setTourDates(prev => prev.filter(td => td.id !== id));
    if (selectedTourDate?.id === id) {
      closeEntityPanel();
    }

    try {
      await deleteMutation.mutateAsync(id);
      toast.success('Tour date deleted');
    } catch {
      // Rollback on error
      setTourDates(previousTourDates);
      if (selectedTourDate) {
        handleSelectTourDate(selectedTourDate);
      }
      toast.error('Failed to delete tour date');
    }
  }, [
    closeEntityPanel,
    deleteMutation,
    handleSelectTourDate,
    selectedTourDate,
    tourDateToDelete,
    tourDates,
  ]);

  const handleConnected = useCallback((newTourDates: TourDateViewModel[]) => {
    setTourDates(newTourDates);
    setIsConnected(true);
  }, []);

  const handleApiKeySaved = useCallback(() => {
    setHasApiKey(true);
  }, []);

  const rightPanel = useMemo(() => {
    if (!selectedTourDate) return null;
    return (
      <TourDateSidebar
        tourDate={selectedTourDate}
        profileId={profileId}
        onClose={closeEntityPanel}
      />
    );
  }, [closeEntityPanel, profileId, selectedTourDate]);

  useRegisterRightPanel(rightPanel);

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
    <div
      className='flex h-full min-h-0 flex-col'
      data-testid='tour-dates-manager'
    >
      {/* Header with connection status */}
      {isConnected && connectionStatus.artistName && (
        <div className='flex shrink-0 items-center justify-between border-b border-subtle bg-surface-1 px-4 py-2'>
          <div className='flex items-center gap-2'>
            <div className='flex h-6 w-6 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/30'>
              <Icon
                name='Check'
                className='h-4 w-4 text-teal-600 dark:text-teal-400'
              />
            </div>
            <span className='text-app text-secondary-token'>
              Connected to{' '}
              <span className='font-caption text-primary-token'>
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

      {/* Events table keeps the remaining height stable across rail state. */}
      <div className='min-h-0 flex-1 overflow-auto'>
        {tourDates.length > 0 ? (
          <TourDatesTable
            tourDates={tourDates}
            onEdit={handleSelectTourDate}
            onDelete={handleDeleteClick}
            onSync={isConnected ? handleSync : undefined}
            isSyncing={syncMutation.isPending}
          />
        ) : (
          <div className='flex flex-col items-center justify-center px-4 py-16 text-center'>
            <Icon name='CalendarX2' className='h-6 w-6 text-tertiary-token' />
            <p className='mt-4 text-app text-secondary-token'>
              No upcoming tour dates
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
                Sync From Bandsintown
              </Button>
            )}
          </div>
        )}
      </div>

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
