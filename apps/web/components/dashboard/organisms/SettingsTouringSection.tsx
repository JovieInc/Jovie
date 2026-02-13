'use client';

import { Button, Input, Label } from '@jovie/ui';
import { CheckCircle2, Loader2, Unplug } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  checkBandsintownConnection,
  connectBandsintownArtist,
  disconnectBandsintown,
  removeBandsintownApiKey,
  saveBandsintownApiKey,
} from '@/app/app/(shell)/dashboard/tour-dates/actions';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import type { Artist } from '@/types/db';

interface SettingsTouringSectionProps {
  readonly artist: Artist;
}

export function SettingsTouringSection({
  artist,
}: SettingsTouringSectionProps) {
  const [apiKey, setApiKey] = useState('');
  const [artistName, setArtistName] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [connectedArtist, setConnectedArtist] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Check connection status on mount
  useEffect(() => {
    checkBandsintownConnection()
      .then(status => {
        setIsConnected(status.connected);
        setConnectedArtist(status.artistName);
        setLastSyncedAt(status.lastSyncedAt);
        if (status.artistName) {
          setArtistName(status.artistName);
        }
      })
      .catch(() => {
        // Silently fail — shows disconnected state
      })
      .finally(() => setIsLoading(false));
  }, []);

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
          setIsConnected(true);
          setConnectedArtist(artistName.trim());
          setApiKey('');
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
  }, [apiKey, artistName]);

  const handleDisconnect = useCallback(async () => {
    setIsDisconnecting(true);
    try {
      const [disconnectResult, removeKeyResult] = await Promise.all([
        disconnectBandsintown(),
        removeBandsintownApiKey(),
      ]);

      if (disconnectResult.success) {
        toast.success('Bandsintown disconnected.');
        setIsConnected(false);
        setConnectedArtist(null);
        setLastSyncedAt(null);
        setArtistName('');
      } else {
        toast.error(
          removeKeyResult.message ?? 'Failed to disconnect. Please try again.'
        );
      }
    } catch {
      toast.error('Failed to disconnect. Please try again.');
    } finally {
      setIsDisconnecting(false);
    }
  }, []);

  if (isLoading) {
    return (
      <DashboardCard variant='settings'>
        <div className='flex items-center justify-center py-8'>
          <Loader2 className='h-5 w-5 animate-spin text-secondary-token' />
          <span className='ml-2 text-sm text-secondary-token'>
            Checking connection...
          </span>
        </div>
      </DashboardCard>
    );
  }

  return (
    <DashboardCard variant='settings'>
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
            {isSaving && <Loader2 className='h-3.5 w-3.5 animate-spin mr-1' />}
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
    </DashboardCard>
  );
}
