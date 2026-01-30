'use client';

import { Button } from '@jovie/ui';
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
      {/* Refresh button */}
      <Button
        type='button'
        size='icon'
        variant='ghost'
        className='h-8 w-8 rounded-md text-tertiary-token transition-colors hover:bg-surface-2 hover:text-primary-token disabled:opacity-50'
        onClick={async (e: React.MouseEvent) => {
          e.stopPropagation();
          await onRefreshIngest();
        }}
        disabled={isRefreshLoading}
        aria-label='Refresh ingest data'
        title='Refresh ingest data'
      >
        <RefreshCw
          className={cn('h-3.5 w-3.5', isRefreshLoading && 'animate-spin')}
        />
      </Button>

      {/* Claimed icon - read-only indicator */}
      <Button
        type='button'
        size='icon'
        variant='ghost'
        className={cn(
          'h-8 w-8 rounded-md transition-colors cursor-default',
          isClaimed
            ? 'text-yellow-500 hover:bg-surface-2'
            : 'text-tertiary-token/40 hover:bg-transparent'
        )}
        disabled
        aria-label={isClaimed ? 'Claimed' : 'Not claimed'}
        title={isClaimed ? 'Claimed' : 'Not claimed'}
      >
        <Star className={cn('h-3.5 w-3.5', isClaimed && 'fill-current')} />
      </Button>

      {/* Verified toggle button */}
      <Button
        type='button'
        size='icon'
        variant='ghost'
        className={cn(
          'h-8 w-8 rounded-md transition-colors hover:bg-surface-2 disabled:opacity-50',
          isVerified
            ? 'text-blue-500 [&_svg]:fill-blue-500 [&_svg]:stroke-white'
            : 'text-tertiary-token/40'
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
        aria-label={
          isVerified
            ? 'Verified - click to unverify'
            : 'Not verified - click to verify'
        }
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
      </Button>
    </div>
  );
}
