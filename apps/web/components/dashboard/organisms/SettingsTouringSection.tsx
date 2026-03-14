'use client';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Label,
} from '@jovie/ui';
import { useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  CheckCircle2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Unlink,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  connectBandsintownArtist,
  disconnectBandsintown,
  removeBandsintownApiKey,
  saveBandsintownApiKey,
  syncFromBandsintown,
} from '@/app/app/(shell)/dashboard/tour-dates/actions';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { TouringSectionSkeleton } from '@/components/molecules/SettingsLoadingSkeleton';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/components/organisms/Dialog';
import { queryKeys } from '@/lib/queries/keys';
import { useBandsintownConnectionQuery } from '@/lib/queries/useBandsintownConnectionQuery';
import { cn } from '@/lib/utils';

const BANDSINTOWN_ACCENT = '#00B4B3';

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

  const isConnected = connectionStatus?.connected ?? false;
  const connectedArtist = connectionStatus?.artistName ?? null;
  const lastSyncedAt = connectionStatus?.lastSyncedAt ?? null;

  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  if (isLoading) {
    return (
      <DashboardCard
        variant='settings'
        padding='none'
        className='overflow-hidden'
      >
        <ContentSectionHeader
          title='Bandsintown'
          subtitle='Connect Bandsintown to keep the tour dates on your profile up to date.'
          className='min-h-0 px-4 py-3'
        />
        <div className='px-4 py-3'>
          <TouringSectionSkeleton />
        </div>
      </DashboardCard>
    );
  }

  if (isError) {
    return (
      <DashboardCard
        variant='settings'
        padding='none'
        className='overflow-hidden'
      >
        <ContentSectionHeader
          title='Bandsintown'
          subtitle='Connect Bandsintown to keep the tour dates on your profile up to date.'
          className='min-h-0 px-4 py-3'
        />
        <div className='px-4 py-3'>
          <ContentSurfaceCard className='space-y-3 bg-(--linear-bg-surface-0) p-3.5'>
            <p className='text-[13px] text-(--linear-text-secondary)'>
              Failed to load connection status.
            </p>
            <Button variant='ghost' size='sm' onClick={() => refetch()}>
              Try again
            </Button>
          </ContentSurfaceCard>
        </div>
      </DashboardCard>
    );
  }

  const handleSyncNow = async () => {
    setIsSyncing(true);
    try {
      const result = await syncFromBandsintown();
      if (result.success) {
        toast.success(result.message);
        await queryClient.invalidateQueries({
          queryKey: queryKeys.tourDates.connection(profileId),
        });
      } else {
        toast.error(result.message);
      }
    } catch {
      toast.error('Failed to sync. Please try again.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDisconnectConfirm = async () => {
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
      await queryClient.invalidateQueries({
        queryKey: queryKeys.tourDates.connection(profileId),
      });
    } catch {
      toast.error('Failed to disconnect. Please try again.');
    }
  };

  return (
    <DashboardCard
      variant='settings'
      padding='none'
      className='overflow-hidden'
    >
      <ContentSectionHeader
        title='Bandsintown'
        subtitle='Connect Bandsintown to keep the tour dates on your profile up to date.'
        className='min-h-0 px-4 py-3'
      />
      <div className='px-4 py-3'>
        <ContentSurfaceCard className='space-y-3 bg-(--linear-bg-surface-0) p-4'>
          <div className='space-y-1'>
            <p className='text-[13px] font-[510] text-(--linear-text-primary)'>
              {isConnected
                ? 'Bandsintown connected'
                : 'Bandsintown not connected'}
            </p>
            <p className='text-[13px] leading-[18px] text-(--linear-text-secondary)'>
              Tour dates will appear on your public profile when connected.
            </p>
          </div>

          <div className='flex flex-wrap items-center gap-2'>
            <BandsintownConnectionPill
              connected={isConnected}
              artistName={connectedArtist}
              lastSyncedAt={lastSyncedAt}
              isSyncing={isSyncing}
              onConnect={() => setConnectDialogOpen(true)}
              onSyncNow={handleSyncNow}
              onDisconnect={() => setDisconnectDialogOpen(true)}
            />
          </div>
        </ContentSurfaceCard>
      </div>

      <BandsintownConnectDialog
        open={connectDialogOpen}
        onOpenChange={setConnectDialogOpen}
        profileId={profileId}
        isConnected={isConnected}
        initialArtistName={connectedArtist ?? ''}
      />

      <ConfirmDialog
        open={disconnectDialogOpen}
        onOpenChange={setDisconnectDialogOpen}
        title='Disconnect Bandsintown?'
        description='Disconnecting will remove synced tour dates and stop future syncs until you reconnect.'
        confirmLabel='Disconnect'
        variant='destructive'
        onConfirm={handleDisconnectConfirm}
      />
    </DashboardCard>
  );
}

// ---------------------------------------------------------------------------
// BandsintownConnectionPill
// ---------------------------------------------------------------------------

interface BandsintownConnectionPillProps {
  readonly connected: boolean;
  readonly artistName: string | null;
  readonly lastSyncedAt: string | null;
  readonly isSyncing: boolean;
  readonly onConnect: () => void;
  readonly onSyncNow: () => void;
  readonly onDisconnect: () => void;
}

function BandsintownConnectionPill({
  connected,
  artistName,
  lastSyncedAt,
  isSyncing,
  onConnect,
  onSyncNow,
  onDisconnect,
}: BandsintownConnectionPillProps) {
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const accent = BANDSINTOWN_ACCENT;

  if (connected) {
    return (
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type='button'
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            className={cn(
              'inline-flex cursor-pointer items-center gap-1.5 rounded-full border py-1 pl-2.5 pr-3 text-[13px] font-[510] transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2'
            )}
            style={
              {
                borderColor: `${accent}30`,
                backgroundColor: `${accent}10`,
                '--tw-ring-color': `${accent}50`,
              } as React.CSSProperties
            }
            aria-label={`Bandsintown connection: ${artistName || 'Connected'}`}
          >
            <Calendar className='h-4 w-4 shrink-0' style={{ color: accent }} />
            <span className='max-w-[160px] truncate text-(--linear-text-secondary)'>
              {artistName || 'Connected'}
            </span>
            {lastSyncedAt && !hovered && !menuOpen && (
              <span className='ml-0.5 text-[10px] text-(--linear-text-tertiary)'>
                {new Date(lastSyncedAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            )}
            {hovered || menuOpen ? (
              <MoreHorizontal
                className='h-4 w-4 shrink-0'
                style={{ color: accent }}
              />
            ) : (
              <CheckCircle2
                className='h-4 w-4 shrink-0'
                style={{ color: accent }}
              />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='start' sideOffset={4}>
          <DropdownMenuItem onClick={onSyncNow} disabled={isSyncing}>
            <RefreshCw
              className={cn('h-3.5 w-3.5', isSyncing && 'animate-spin')}
            />
            {isSyncing ? 'Syncing...' : 'Sync now'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant='destructive' onClick={onDisconnect}>
            <Unlink className='h-4 w-4' />
            Disconnect
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <button
      type='button'
      onClick={onConnect}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-(--linear-border-subtle) bg-(--linear-bg-surface-1) py-1 pl-2.5 pr-3 text-[13px] font-[510] text-(--linear-text-secondary) transition-colors',
        'hover:bg-(--linear-bg-surface-2) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2'
      )}
      style={
        {
          '--tw-ring-color': `${accent}50`,
        } as React.CSSProperties
      }
      aria-label='Connect Bandsintown'
    >
      <Calendar className='h-4 w-4 shrink-0' style={{ color: accent }} />
      <span>Bandsintown</span>
      <Plus className='h-4 w-4 shrink-0' />
    </button>
  );
}

// ---------------------------------------------------------------------------
// BandsintownConnectDialog
// ---------------------------------------------------------------------------

interface BandsintownConnectDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly profileId: string;
  readonly isConnected: boolean;
  readonly initialArtistName: string;
}

function BandsintownConnectDialog({
  open,
  onOpenChange,
  profileId,
  isConnected,
  initialArtistName,
}: BandsintownConnectDialogProps) {
  const queryClient = useQueryClient();
  const [artistName, setArtistName] = useState(initialArtistName);
  const [apiKey, setApiKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const hasInitialized = useRef(false);
  const lastInitialName = useRef(initialArtistName);

  // Sync from props when dialog opens or initial value changes
  useEffect(() => {
    if (lastInitialName.current !== initialArtistName) {
      hasInitialized.current = false;
      lastInitialName.current = initialArtistName;
    }
    if (open && !hasInitialized.current) {
      setArtistName(initialArtistName);
      hasInitialized.current = true;
    }
    if (!open) {
      hasInitialized.current = false;
    }
  }, [open, initialArtistName]);

  const handleSubmit = useCallback(async () => {
    setIsSaving(true);
    try {
      if (apiKey.trim()) {
        const keyResult = await saveBandsintownApiKey({
          apiKey: apiKey.trim(),
        });
        if (!keyResult.success) {
          toast.error(keyResult.message);
          return;
        }
      }

      if (artistName.trim()) {
        const result = await connectBandsintownArtist({
          artistName: artistName.trim(),
        });
        if (result.success) {
          toast.success(result.message);
          setApiKey('');
          onOpenChange(false);
          await queryClient.invalidateQueries({
            queryKey: queryKeys.tourDates.connection(profileId),
          });
        } else {
          toast.error(result.message);
        }
      } else if (apiKey.trim()) {
        toast.success('API key saved.');
        setApiKey('');
        onOpenChange(false);
      }
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [apiKey, artistName, onOpenChange, queryClient, profileId]);

  return (
    <Dialog open={open} onClose={() => onOpenChange(false)} size='md'>
      <DialogTitle>
        {isConnected ? 'Update Bandsintown' : 'Connect Bandsintown'}
      </DialogTitle>
      <DialogDescription>
        Enter your Bandsintown artist name to sync tour dates to your profile.
      </DialogDescription>

      <DialogBody>
        <div className='space-y-3'>
          <div className='space-y-1.5'>
            <Label htmlFor='bandsintown-artist' className='text-[11px]'>
              Artist name
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
            <Label htmlFor='bandsintown-api-key' className='text-[11px]'>
              API key{' '}
              <span className='font-normal text-(--linear-text-tertiary)'>
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
      </DialogBody>

      <DialogActions>
        <Button
          variant='ghost'
          size='sm'
          onClick={() => onOpenChange(false)}
          disabled={isSaving}
        >
          Cancel
        </Button>
        <Button
          size='sm'
          onClick={handleSubmit}
          disabled={isSaving || (!apiKey.trim() && !artistName.trim())}
          loading={isSaving}
        >
          {isConnected ? 'Update' : 'Connect'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
