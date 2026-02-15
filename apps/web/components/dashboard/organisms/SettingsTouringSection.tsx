'use client';

import { Button, Input, Label } from '@jovie/ui';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, Unplug } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  connectBandsintownArtist,
  disconnectBandsintown,
  removeBandsintownApiKey,
  saveBandsintownApiKey,
} from '@/app/app/(shell)/dashboard/tour-dates/actions';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { TouringSectionSkeleton } from '@/components/molecules/SettingsLoadingSkeleton';
import { queryKeys } from '@/lib/queries/keys';
import { useBandsintownConnectionQuery } from '@/lib/queries/useBandsintownConnectionQuery';

interface SettingsTouringSectionProps {
  readonly profileId: string;
}

export function SettingsTouringSection({
  profileId,
}: SettingsTouringSectionProps) {
  const queryClient = useQueryClient();
  const {
    data: connectionStatus,
    isLoading,
    isError,
    refetch,
  } = useBandsintownConnectionQuery(profileId);

  const [apiKey, setApiKey] = useState('');
  const [artistName, setArtistName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  // Derive connection state from query data
  const isConnected = connectionStatus?.connected ?? false;
  const connectedArtist = connectionStatus?.artistName ?? null;
  const lastSyncedAt = connectionStatus?.lastSyncedAt ?? null;

  // Sync artistName input from fetched data once on initial load
  const hasInitialized = useRef(false);
  const lastProfileId = useRef(profileId);
  useEffect(() => {
    // Reset when profileId changes so new profile data gets synced
    if (lastProfileId.current !== profileId) {
      hasInitialized.current = false;
      lastProfileId.current = profileId;
      setArtistName('');
    }
    if (connectionStatus?.artistName && !hasInitialized.current) {
      setArtistName(connectionStatus.artistName);
      hasInitialized.current = true;
    }
  }, [connectionStatus?.artistName, profileId]);

  const handleSaveAndConnect = useCallback(async () => {
    setIsSaving(true);
    try {
      // Save API key first if provided
      if (apiKey.trim()) {
        const keyResult = await saveBandsintownApiKey({
          apiKey: apiKey.trim(),
        });
        if (!keyResult.success) {
          toast.error(keyResult.message);
          return;
        }
      }

      // Connect artist
      if (artistName.trim()) {
        const result = await connectBandsintownArtist({
          artistName: artistName.trim(),
        });
        if (result.success) {
          toast.success(result.message);
          setApiKey('');
          // Refresh connection status from server
          await queryClient.invalidateQueries({
            queryKey: queryKeys.tourDates.connection(profileId),
          });
        } else {
          toast.error(result.message);
        }
      } else if (apiKey.trim()) {
        toast.success('API key saved.');
        setApiKey('');
      }
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [apiKey, artistName, queryClient, profileId]);

  const handleDisconnect = useCallback(async () => {
    setIsDisconnecting(true);
    try {
      const disconnectResult = await disconnectBandsintown();
      if (!disconnectResult.success) {
        toast.error('Failed to disconnect. Please try again.');
        return;
      }

      const removeKeyResult = await removeBandsintownApiKey();
      if (!removeKeyResult.success) {
        toast.error(removeKeyResult.message ?? 'Failed to remove API key.');
      }

      toast.success('Bandsintown disconnected.');
      setArtistName('');
      // Refresh connection status from server
      await queryClient.invalidateQueries({
        queryKey: queryKeys.tourDates.connection(profileId),
      });
    } catch {
      toast.error('Failed to disconnect. Please try again.');
    } finally {
      setIsDisconnecting(false);
    }
  }, [queryClient, profileId]);

  return (
    <DashboardCard variant='settings'>
      {isLoading ? (
        <TouringSectionSkeleton />
      ) : isError ? (
        <div className='flex flex-col items-center gap-2 py-6'>
          <p className='text-sm text-secondary-token'>
            Failed to load connection status.
          </p>
          <Button size='sm' variant='ghost' onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <div className='space-y-4'>
          <p className='text-sm text-secondary-token'>
            Tour dates will appear on your public profile when connected.
          </p>

          {isConnected && connectedArtist && (
            <div className='flex items-center gap-2 rounded-md bg-green-500/10 px-3 py-2'>
              <CheckCircle2 className='h-4 w-4 text-green-500 shrink-0' />
              <span className='text-sm text-primary-token'>
                Connected as <strong>{connectedArtist}</strong>
              </span>
              {lastSyncedAt && (
                <span className='text-xs text-tertiary-token ml-auto'>
                  Last synced{' '}
                  {new Date(lastSyncedAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              )}
            </div>
          )}

          <div className='space-y-3'>
            <div className='space-y-1.5'>
              <Label htmlFor='bandsintown-artist' className='text-xs'>
                Bandsintown artist name
              </Label>
              <Input
                id='bandsintown-artist'
                value={artistName}
                onChange={e => setArtistName(e.target.value)}
                placeholder='e.g. The Beatles'
                disabled={isSaving}
              />
            </div>

            <div className='space-y-1.5'>
              <Label htmlFor='bandsintown-api-key' className='text-xs'>
                API key{' '}
                <span className='text-tertiary-token font-normal'>
                  (optional)
                </span>
              </Label>
              <Input
                id='bandsintown-api-key'
                type='password'
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder='Your Bandsintown API key'
                disabled={isSaving}
              />
            </div>
          </div>

          <div className='flex items-center gap-2'>
            <Button
              size='sm'
              onClick={handleSaveAndConnect}
              disabled={isSaving || (!apiKey.trim() && !artistName.trim())}
            >
              {isSaving && (
                <Loader2 className='h-3.5 w-3.5 animate-spin mr-1' />
              )}
              {isConnected ? 'Update' : 'Connect'}
            </Button>
            {isConnected && (
              <Button
                variant='ghost'
                size='sm'
                onClick={handleDisconnect}
                disabled={isDisconnecting}
                className='text-destructive hover:text-destructive'
              >
                {isDisconnecting ? (
                  <Loader2 className='h-3.5 w-3.5 animate-spin mr-1' />
                ) : (
                  <Unplug className='h-3.5 w-3.5 mr-1' />
                )}
                Disconnect
              </Button>
            )}
          </div>
        </div>
      )}
    </DashboardCard>
  );
}
