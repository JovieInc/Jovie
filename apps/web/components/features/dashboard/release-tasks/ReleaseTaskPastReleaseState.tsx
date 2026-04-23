'use client';

interface ReleaseTaskPastReleaseStateProps {
  readonly onSetUpAnyway: () => void;
  readonly isLoading: boolean;
}

export function ReleaseTaskPastReleaseState({
  onSetUpAnyway,
  isLoading,
}: ReleaseTaskPastReleaseStateProps) {
  return (
    <div className='flex min-h-[180px] flex-col items-center justify-center rounded-lg border border-(--linear-app-frame-seam) bg-surface-1 px-4 py-10 text-center'>
      <p className='text-[14px] font-medium text-secondary-token mb-1'>
        This release is already out
      </p>
      <p className='text-xs text-tertiary-token mb-4 max-w-[260px]'>
        Campaign tasks help you prepare for upcoming releases. Since this one is
        already live, there&apos;s nothing to prepare.
      </p>
      <button
        type='button'
        onClick={onSetUpAnyway}
        disabled={isLoading}
        className='text-[11px] text-tertiary-token hover:text-secondary-token underline transition-colors disabled:cursor-not-allowed disabled:opacity-50'
        aria-busy={isLoading}
      >
        {isLoading ? 'Generating...' : 'Generate Release Plan Anyway'}
      </button>
    </div>
  );
}
