'use client';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@jovie/ui';
import { ChevronDown } from 'lucide-react';
import { Icon } from '@/components/atoms/Icon';
import {
  DASHBOARD_HEADER_ACTION_TEXT_BUTTON_CLASS,
  DashboardHeaderActionButton,
} from '@/features/dashboard/atoms/DashboardHeaderActionButton';
import { cn } from '@/lib/utils';

export interface NewReleaseHeaderActionProps {
  /** Whether manual creation is permitted for this profile (plan-gated). */
  readonly canCreateManualReleases: boolean;
  /** Whether the Spotify sync is currently running. */
  readonly isSyncing?: boolean;
  /** Triggered when the user chooses "Sync from Spotify". */
  readonly onSyncSpotify: () => void;
  /** Triggered when the user chooses "Add manually". */
  readonly onCreateManual: () => void;
}

/**
 * Header affordance for creating a new release.
 *
 * - When only one creation path exists (Spotify sync), renders a single
 *   labeled button instead of a dropdown.
 * - When multiple paths exist, renders a labeled "New release" button with a
 *   chevron that opens a dropdown listing every wired-up creation path.
 *
 * Only wires up creation paths that already exist in the codebase.
 */
export function NewReleaseHeaderAction({
  canCreateManualReleases,
  isSyncing = false,
  onSyncSpotify,
  onCreateManual,
}: NewReleaseHeaderActionProps) {
  // Single path: render a plain labeled button (no dropdown).
  if (!canCreateManualReleases) {
    return (
      <DashboardHeaderActionButton
        ariaLabel='Sync releases from Spotify'
        onClick={onSyncSpotify}
        disabled={isSyncing}
        icon={
          <Icon
            name={isSyncing ? 'Loader2' : 'RefreshCw'}
            className={cn(
              'h-3.5 w-3.5',
              isSyncing && 'animate-spin motion-reduce:animate-none'
            )}
            strokeWidth={2}
          />
        }
        label={isSyncing ? 'Syncing...' : 'Sync from Spotify'}
        hideLabelOnMobile
        tooltipLabel='Sync from Spotify'
      />
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type='button'
          variant='ghost'
          size='sm'
          aria-label='Create a new release'
          className={cn(DASHBOARD_HEADER_ACTION_TEXT_BUTTON_CLASS, 'pr-1.5')}
          data-testid='new-release-header-trigger'
        >
          <Icon name='Plus' className='h-3.5 w-3.5' strokeWidth={2} />
          <span className='max-sm:hidden sm:inline'>New release</span>
          <ChevronDown
            className='h-3 w-3 text-tertiary-token'
            strokeWidth={2}
            aria-hidden='true'
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' sideOffset={6} className='w-56'>
        <DropdownMenuItem
          onSelect={event => {
            event.preventDefault();
            onSyncSpotify();
          }}
          disabled={isSyncing}
          data-testid='new-release-sync-spotify'
        >
          <Icon
            name={isSyncing ? 'Loader2' : 'RefreshCw'}
            className={cn(
              'h-4 w-4',
              isSyncing && 'animate-spin motion-reduce:animate-none'
            )}
            aria-hidden='true'
          />
          <span>{isSyncing ? 'Syncing...' : 'Sync from Spotify'}</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={event => {
            event.preventDefault();
            onCreateManual();
          }}
          data-testid='new-release-add-manually'
        >
          <Icon name='Plus' className='h-4 w-4' aria-hidden='true' />
          <span>Add manually</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
