'use client';

import { IconButton } from '@jovie/ui';
import { BadgeCheck, RefreshCw, Star } from 'lucide-react';
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

  return (
    <div className='flex items-center justify-end gap-1'>
      <IconButton
        size='sm'
        variant='control'
        ariaLabel='Refresh creator music data'
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
      </IconButton>

      <IconButton
        size='sm'
        variant='control'
        ariaLabel={isClaimed ? 'Claimed' : 'Not claimed'}
        disabled
        title={isClaimed ? 'Claimed' : 'Not claimed'}
        className='cursor-default'
      >
        <Star
          className={cn(
            'h-3.5 w-3.5',
            isClaimed ? 'fill-current text-yellow-500' : 'opacity-40'
          )}
        />
      </IconButton>

      <IconButton
        size='sm'
        variant='control'
        ariaLabel={
          isVerified
            ? 'Verified - click to unverify'
            : 'Not verified - click to verify'
        }
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
            isVerificationLoading && 'animate-pulse',
            isVerified && 'fill-info text-info'
          )}
        />
      </IconButton>
    </div>
  );
}
