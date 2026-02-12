'use client';

import { Button, Input } from '@jovie/ui';
import { CalendarDays, Link2, Loader2, RefreshCw, Unlink } from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import type { BandsintownConnectionStatus } from '@/app/app/(shell)/dashboard/tour-dates/actions';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import {
  useConnectBandsintownMutation,
  useDisconnectBandsintownMutation,
  useSaveBandsintownApiKeyMutation,
  useSyncFromBandsintownMutation,
} from '@/lib/queries/useTourDateMutations';

interface SettingsTourDatesCardProps {
  readonly profileId: string;
  readonly initialConnectionStatus: BandsintownConnectionStatus;
}

function formatLastSyncedLabel(lastSyncedAt: string | null): string {
  if (!lastSyncedAt) return 'Not synced yet';

  const date = new Date(lastSyncedAt);
  if (Number.isNaN(date.getTime())) return 'Not synced yet';

  return `Last synced ${date.toLocaleString()}`;
}

export function SettingsTourDatesCard({
  profileId,
  initialConnectionStatus,
}: SettingsTourDatesCardProps) {
  const [hasApiKey, setHasApiKey] = useState(initialConnectionStatus.hasApiKey);
  const [isConnected, setIsConnected] = useState(
    initialConnectionStatus.connected
  );
  const [connectedArtistName, setConnectedArtistName] = useState(
    initialConnectionStatus.artistName
  );
  const [lastSyncedAt, setLastSyncedAt] = useState(
    initialConnectionStatus.lastSyncedAt
  );
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [artistNameInput, setArtistNameInput] = useState(
    initialConnectionStatus.artistName ?? ''
  );

  const saveApiKeyMutation = useSaveBandsintownApiKeyMutation(profileId);
  const connectMutation = useConnectBandsintownMutation(profileId);
  const syncMutation = useSyncFromBandsintownMutation(profileId);
  const disconnectMutation = useDisconnectBandsintownMutation(profileId);

  const handleSaveApiKey = useCallback(async () => {
    const apiKey = apiKeyInput.trim();
    if (!apiKey) {
      toast.error('Please enter your Bandsintown API key');
      return;
    }

    try {
      const result = await saveApiKeyMutation.mutateAsync({ apiKey });
      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      setHasApiKey(true);
      setApiKeyInput('');
    } catch {
      toast.error('Failed to save Bandsintown API key');
    }
  }, [apiKeyInput, saveApiKeyMutation]);

  const handleConnect = useCallback(async () => {
    const artistName = artistNameInput.trim();
    if (!artistName) {
      toast.error('Please enter your Bandsintown artist name');
      return;
    }

    try {
      const result = await connectMutation.mutateAsync({ artistName });
      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      setIsConnected(true);
      setConnectedArtistName(artistName);
      setLastSyncedAt(new Date().toISOString());
    } catch {
      toast.error('Failed to connect Bandsintown');
    }
  }, [artistNameInput, connectMutation]);

  const handleSync = useCallback(async () => {
    try {
      const result = await syncMutation.mutateAsync();
      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      setLastSyncedAt(new Date().toISOString());
    } catch {
      toast.error('Failed to sync from Bandsintown');
    }
  }, [syncMutation]);

  const handleDisconnect = useCallback(async () => {
    try {
      const result = await disconnectMutation.mutateAsync();
      if (!result.success) {
        toast.error('Failed to disconnect Bandsintown');
        return;
      }

      toast.success('Disconnected Bandsintown');
      setIsConnected(false);
      setConnectedArtistName(null);
      setLastSyncedAt(null);
    } catch {
      toast.error('Failed to disconnect Bandsintown');
    }
  }, [disconnectMutation]);

  return (
    <DashboardCard variant='settings' className='space-y-4'>
      <div className='flex items-start justify-between gap-3'>
        <div>
          <h3 className='text-sm font-semibold text-primary-token'>
            Tour Dates
          </h3>
          <p className='text-xs text-tertiary-token'>
            Connect Bandsintown. Upcoming shows will appear publicly on your
            profile.
          </p>
        </div>
        <CalendarDays className='h-4 w-4 text-tertiary-token' />
      </div>

      {!hasApiKey && (
        <div className='space-y-3'>
          <Input
            type='password'
            inputSize='lg'
            value={apiKeyInput}
            onChange={e => setApiKeyInput(e.target.value)}
            placeholder='Bandsintown API key'
            disabled={saveApiKeyMutation.isPending}
          />
          <Button
            type='button'
            onClick={handleSaveApiKey}
            disabled={saveApiKeyMutation.isPending || !apiKeyInput.trim()}
            className='w-full sm:w-auto'
          >
            {saveApiKeyMutation.isPending ? (
              <>
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                Saving key...
              </>
            ) : (
              'Save API Key'
            )}
          </Button>
          <p className='text-xs text-tertiary-token'>
            Get your key at artists.bandsintown.com and paste it here.
          </p>
        </div>
      )}

      {hasApiKey && !isConnected && (
        <div className='space-y-3'>
          <Input
            type='text'
            inputSize='lg'
            value={artistNameInput}
            onChange={e => setArtistNameInput(e.target.value)}
            placeholder='Artist name on Bandsintown'
            disabled={connectMutation.isPending}
          />
          <Button
            type='button'
            onClick={handleConnect}
            disabled={connectMutation.isPending || !artistNameInput.trim()}
            className='w-full sm:w-auto'
          >
            {connectMutation.isPending ? (
              <>
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                Connecting...
              </>
            ) : (
              <>
                <Link2 className='mr-2 h-4 w-4' />
                Connect Bandsintown
              </>
            )}
          </Button>
        </div>
      )}

      {hasApiKey && isConnected && (
        <div className='space-y-3'>
          <div className='rounded-lg border border-subtle bg-surface-2/50 px-3 py-2'>
            <p className='text-xs font-medium text-primary-token'>
              Connected: {connectedArtistName ?? 'Bandsintown artist'}
            </p>
            <p className='mt-0.5 text-xs text-tertiary-token'>
              {formatLastSyncedLabel(lastSyncedAt)}
            </p>
          </div>
          <div className='flex flex-wrap gap-2'>
            <Button
              type='button'
              variant='ghost'
              onClick={handleSync}
              disabled={syncMutation.isPending}
              className='gap-1.5'
            >
              <RefreshCw
                className={`h-4 w-4 ${syncMutation.isPending ? 'animate-spin' : ''}`}
              />
              Sync now
            </Button>
            <Button
              type='button'
              variant='ghost'
              onClick={handleDisconnect}
              disabled={disconnectMutation.isPending}
              className='gap-1.5 text-tertiary-token hover:text-secondary-token'
            >
              <Unlink className='h-4 w-4' />
              Disconnect
            </Button>
          </div>
        </div>
      )}
    </DashboardCard>
  );
}
