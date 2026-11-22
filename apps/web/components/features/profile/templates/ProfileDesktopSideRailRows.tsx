'use client';

import { Switch } from '@jovie/ui';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const ROW_CLASS =
  'group flex min-h-14 w-full items-center justify-between gap-4 rounded-xl px-1 py-3 text-left transition-colors duration-subtle hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus';

/**
 * Flat side-rail rows (Get updates, Pay) for the desktop home. One row per
 * action, said once: no card, no header-plus-label-plus-button stack.
 */
export function ProfileDesktopSideRailRows({
  artistName,
  showUpdates,
  isSubscribed,
  showArtistEmailRow,
  hasTip,
  onGetUpdates,
  onOpenPayments,
}: Readonly<{
  artistName: string;
  showUpdates: boolean;
  isSubscribed: boolean;
  showArtistEmailRow: boolean;
  hasTip: boolean;
  onGetUpdates: () => void;
  onOpenPayments: (trigger: HTMLElement) => void;
}>) {
  return (
    <>
      <div
        className={cn(
          'min-w-0 divide-y divide-white/8',
          showUpdates ? undefined : 'hidden'
        )}
        data-testid='profile-desktop-alerts-card'
      >
        <button
          type='button'
          onClick={() => onGetUpdates()}
          data-testid={
            isSubscribed
              ? 'profile-desktop-manage-updates'
              : 'profile-desktop-get-updates'
          }
          className={ROW_CLASS}
        >
          <span className='min-w-0'>
            <span className='block truncate text-mid font-semibold tracking-[-0.015em] text-white dark:text-white'>
              {isSubscribed ? 'Updates on' : 'Get updates'}
            </span>
            <span className='block truncate text-xs leading-5 text-white/48'>
              {isSubscribed
                ? 'Manage what you hear about.'
                : 'New music, shows, and merch.'}
            </span>
          </span>
          <ChevronRight
            className='size-4 shrink-0 text-white/40 transition-colors duration-subtle group-hover:text-white/70'
            aria-hidden='true'
          />
        </button>

        {showArtistEmailRow ? (
          <div className='flex items-center justify-between gap-4 px-1 py-3'>
            <div className='min-w-0'>
              <p className='text-sm font-medium tracking-[-0.015em] text-white/84'>
                Artist Emails
              </p>
              <p className='text-xs leading-5 text-white/48'>
                Occasional emails from {artistName}.
              </p>
            </div>
            <Switch
              checked={isSubscribed}
              onCheckedChange={() => onGetUpdates()}
              aria-label='Artist Emails'
              className='data-[state=checked]:bg-white/36 data-[state=unchecked]:bg-white/14'
            />
          </div>
        ) : null}
      </div>
      {hasTip ? (
        <div data-testid='profile-desktop-payments-card'>
          <button
            type='button'
            onClick={event => onOpenPayments(event.currentTarget)}
            data-testid='profile-desktop-open-payments'
            className={ROW_CLASS}
          >
            <span className='min-w-0'>
              <span className='block truncate text-mid font-semibold tracking-[-0.015em] text-white dark:text-white'>
                Pay {artistName}
              </span>
              <span className='block truncate text-xs leading-5 text-white/48'>
                Send support directly.
              </span>
            </span>
            <ChevronRight
              className='size-4 shrink-0 text-white/40 transition-colors duration-subtle group-hover:text-white/70'
              aria-hidden='true'
            />
          </button>
        </div>
      ) : null}
    </>
  );
}
