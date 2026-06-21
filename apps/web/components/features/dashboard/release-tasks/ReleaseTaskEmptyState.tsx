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
    <div className='flex min-h-55 flex-col items-center justify-center rounded-lg border border-(--linear-app-frame-seam) bg-surface-1 px-4 py-12 text-center'>
      <p className='text-app font-medium text-primary-token mb-1'>
        Your release playbook
      </p>
      <p className='text-xs text-tertiary-token mb-4 max-w-70'>
        20 battle-tested tasks to maximize your release — from DSP pitching to
        fan notifications.
      </p>
      <ul className='text-2xs text-secondary-token space-y-1 mb-5'>
        <li>• Pitch to Spotify editorial</li>
        <li>• Upload Spotify Canvas video</li>
        <li>• Submit lyrics to Genius</li>
        <li>• Send fan notification</li>
      </ul>
      <button
        type='button'
        onClick={onSetUp}
        disabled={isLoading}
        className='rounded-md border border-(--linear-btn-primary-border) bg-btn-primary px-4 py-2 text-xs font-medium text-btn-primary-foreground shadow-button-inset transition-colors duration-subtle hover:border-(--linear-btn-primary-hover) hover:bg-btn-primary-hover disabled:cursor-not-allowed disabled:opacity-50'
      >
        {isLoading ? 'Generating...' : 'Generate Release Plan'}
      </button>
    </div>
  );
}
