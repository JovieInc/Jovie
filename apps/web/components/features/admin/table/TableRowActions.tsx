'use client';

import { BadgeCheck, RefreshCw, Star } from 'lucide-react';
import { AppIconButton } from '@/components/atoms/AppIconButton';
import { cn } from '@/lib/utils';

export interface TableRowActionsProps {
  readonly isVerified: boolean;
  readonly isClaimed: boolean;
  readonly verificationStatus: 'idle' | 'loading' | 'success' | 'error';
  readonly refreshIngestStatus: 'idle' | 'loading' | 'success' | 'error';
  readonly onToggleVerification: () => Promise<void>;
  readonly onRefreshIngest: () => void | Promise<void>;
}

export function TableRowActions({
  isVerified,
  isClaimed,
  verificationStatus,
  refreshIngestStatus,
  onToggleVerification,
  onRefreshIngest,
}: Readonly<TableRowActionsProps>) {
  const isVerificationLoading = verificationStatus === 'loading';
  const isRefreshLoading = refreshIngestStatus === 'loading';
  const rowActionClassName =
    'h-8 w-8 rounded-[8px] bg-transparent text-quaternary-token hover:bg-surface-1 hover:text-secondary-token active:bg-surface-0 focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)/25 [&_svg]:h-3.5 [&_svg]:w-3.5';

  return (
    <div className='flex items-center justify-end gap-1'>
      {/* Refresh button */}
      <AppIconButton
        ariaLabel='Refresh creator music data'
        className={rowActionClassName}
        onClick={async (e: React.MouseEvent) => {
          e.stopPropagation();
          await onRefreshIngest();
        }}
        disabled={isRefreshLoading}
        title='Refresh creator music data'
      >
        <RefreshCw
          className={cn('h-3.5 w-3.5', isRefreshLoading && 'animate-spin')}
        />
      </AppIconButton>

      {/* Claimed icon - read-only indicator */}
      <AppIconButton
        ariaLabel={isClaimed ? 'Claimed' : 'Not claimed'}
        className={cn(
          rowActionClassName,
          'cursor-default',
          isClaimed
            ? 'text-yellow-500 hover:bg-transparent hover:text-yellow-500'
            : 'text-quaternary-token/40 hover:bg-transparent hover:text-quaternary-token/40'
        )}
        disabled
        title={isClaimed ? 'Claimed' : 'Not claimed'}
      >
        <Star className={cn('h-3.5 w-3.5', isClaimed && 'fill-current')} />
      </AppIconButton>

      {/* Verified toggle button */}
      <AppIconButton
        ariaLabel={
          isVerified
            ? 'Verified - click to unverify'
            : 'Not verified - click to verify'
        }
        className={cn(
          rowActionClassName,
          isVerified
            ? 'text-info hover:text-info [&_svg]:fill-info [&_svg]:stroke-white'
            : 'text-quaternary-token/40'
        )}
        onClick={async (e: React.MouseEvent) => {
          e.stopPropagation();
          try {
            await onToggleVerification();
          } catch {
            // Parent should set verificationStatus='error'; avoid unhandled rejection
          }
        }}
        disabled={isVerificationLoading}
        aria-pressed={isVerified}
        title={
          isVerified
            ? 'Verified - click to unverify'
            : 'Not verified - click to verify'
        }
      >
        <BadgeCheck
          className={cn(
            'h-3.5 w-3.5',
            isVerificationLoading && 'animate-pulse'
          )}
        />
      </AppIconButton>
    </div>
  );
}
