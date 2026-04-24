'use client';

interface ReleaseTaskEmptyStateProps {
  readonly onSetUp: () => void;
  readonly isLoading: boolean;
}

export function ReleaseTaskEmptyState({
  onSetUp,
  isLoading,
}: ReleaseTaskEmptyStateProps) {
  return (
    <div className='flex min-h-[220px] flex-col items-center justify-center rounded-lg border border-(--linear-app-frame-seam) bg-surface-1 px-4 py-12 text-center'>
      <p className='text-app font-medium text-primary-token mb-1'>
        Your release playbook
      </p>
      <p className='text-xs text-tertiary-token mb-4 max-w-[280px]'>
        20 battle-tested tasks to maximize your release — from DSP pitching to
        fan notifications.
      </p>
      <ul className='text-[11px] text-secondary-token space-y-1 mb-5'>
        <li>• Pitch to Spotify editorial</li>
        <li>• Upload Spotify Canvas video</li>
        <li>• Submit lyrics to Genius</li>
        <li>• Send fan notification</li>
      </ul>
      <button
        type='button'
        onClick={onSetUp}
        disabled={isLoading}
        className='rounded-md bg-[var(--linear-accent,#5e6ad2)] px-4 py-2 text-xs font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50'
      >
        {isLoading ? 'Generating...' : 'Generate Release Plan'}
      </button>
    </div>
  );
}
