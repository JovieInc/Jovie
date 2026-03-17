import { Icon } from '@/components/atoms/Icon';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import type { DspMatchStatus } from '@/lib/dsp-enrichment/types';

type FilterStatus = DspMatchStatus | 'all';

export interface DspMatchEmptyStateProps {
  readonly status: FilterStatus;
}

const EMPTY_STATE_MESSAGES: Record<
  FilterStatus,
  { title: string; description: string; icon: string }
> = {
  all: {
    title: 'No platform matches found',
    description:
      "We haven't found any streaming platform matches for your profile yet. Check back soon!",
    icon: 'Music',
  },
  suggested: {
    title: 'No pending matches',
    description:
      'All suggested matches have been reviewed. New matches will appear here automatically.',
    icon: 'CheckCircle',
  },
  confirmed: {
    title: 'No confirmed matches',
    description: 'Matches you confirm will appear here.',
    icon: 'CheckCircle',
  },
  auto_confirmed: {
    title: 'No auto-confirmed matches',
    description: 'Automatically confirmed matches will appear here.',
    icon: 'Sparkles',
  },
  rejected: {
    title: 'No rejected matches',
    description: 'Matches you reject will appear here.',
    icon: 'XCircle',
  },
};

/**
 * DspMatchEmptyState - Empty state for DSP match list
 *
 * Displays contextual messages based on the current filter status.
 */
export function DspMatchEmptyState({ status }: DspMatchEmptyStateProps) {
  const { title, description, icon } = EMPTY_STATE_MESSAGES[status];

  return (
    <ContentSurfaceCard className='flex flex-col items-center justify-center gap-4 px-4 py-12 text-center'>
      <div className='flex h-12 w-12 items-center justify-center rounded-[10px] border border-subtle bg-surface-0 text-tertiary-token'>
        <Icon name={icon} className='h-6 w-6' />
      </div>

      <div className='space-y-1'>
        <h3 className='text-[13px] font-[510] text-primary-token'>{title}</h3>
        <p className='text-[13px] text-secondary-token'>{description}</p>
      </div>
    </ContentSurfaceCard>
  );
}
