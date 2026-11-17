'use client';

import { PlainButton } from '@jovie/ui';

interface ReleaseTaskPastReleaseStateProps {
  readonly onSetUpAnyway: () => void;
  readonly isLoading: boolean;
}

export function ReleaseTaskPastReleaseState({
  onSetUpAnyway,
  isLoading,
}: ReleaseTaskPastReleaseStateProps) {
  return (
    <div className='flex min-h-45 flex-col items-center justify-center rounded-lg border border-subtle bg-surface-1 px-4 py-10 text-center'>
      <p className='text-sm font-medium text-secondary-token mb-1'>
        This release is already out
      </p>
      <p className='text-xs text-tertiary-token mb-4 max-w-65'>
        Campaign tasks help you prepare for upcoming releases. Since this one is
        already live, there&apos;s nothing to prepare.
      </p>
      <PlainButton
        onClick={onSetUpAnyway}
        disabled={isLoading}
        className='text-2xs text-tertiary-token hover:text-secondary-token underline transition-colors disabled:cursor-not-allowed disabled:opacity-50'
        aria-busy={isLoading}
      >
        {isLoading ? 'Generating...' : 'Generate Release Plan Anyway'}
      </PlainButton>
    </div>
  );
}
