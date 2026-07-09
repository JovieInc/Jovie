'use client';

import { ListChecks } from 'lucide-react';
import { EmptyState } from '@/components/molecules/EmptyState';

interface ReleaseTaskEmptyStateProps {
  readonly onSetUp: () => void;
  readonly isLoading: boolean;
}

/**
 * Domain wrapper around the canonical EmptyState for release playbooks.
 * Kept as a thin named export so ReleaseTaskChecklist call-sites stay stable.
 */
export function ReleaseTaskEmptyState({
  onSetUp,
  isLoading,
}: ReleaseTaskEmptyStateProps) {
  return (
    <div className='rounded-lg border border-(--linear-app-frame-seam) bg-surface-1'>
      <EmptyState
        icon={<ListChecks className='h-5 w-5' aria-hidden='true' />}
        heading='Your Release Playbook'
        description='20 battle-tested tasks to maximize your release — from DSP pitching to fan notifications.'
        action={{
          label: isLoading ? 'Generating...' : 'Generate Release Plan',
          onClick: onSetUp,
          disabled: isLoading,
        }}
        className='min-h-55 px-4 py-12'
      />
    </div>
  );
}
