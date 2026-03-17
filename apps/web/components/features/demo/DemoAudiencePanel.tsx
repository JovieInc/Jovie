'use client';

import { DotBadge, type DotBadgeVariant } from '@/components/atoms/DotBadge';
import { ContentMetricCard } from '@/components/molecules/ContentMetricCard';
import {
  AUDIENCE_MEMBERS,
  AUDIENCE_SUMMARY,
} from '@/features/home/demo/mock-data';

const INTENT_STYLE: Record<string, DotBadgeVariant> = {
  High: {
    className:
      'border-[color:color-mix(in_oklab,var(--color-success)_28%,transparent)] bg-[color:color-mix(in_oklab,var(--color-success)_12%,transparent)] text-[var(--color-success)]',
    dotClassName: 'bg-[var(--color-success)]',
  },
  Medium: {
    className:
      'border-[color:color-mix(in_oklab,var(--color-warning)_28%,transparent)] bg-[color:color-mix(in_oklab,var(--color-warning)_12%,transparent)] text-[var(--color-warning)]',
    dotClassName: 'bg-[var(--color-warning)]',
  },
  Low: {
    className:
      'border-(--linear-app-frame-seam) bg-surface-1 text-secondary-token',
    dotClassName: 'bg-(--linear-text-quaternary)',
  },
};

export function DemoAudiencePanel() {
  return (
    <div className='h-full overflow-y-auto'>
      {/* Summary cards */}
      <div className='grid grid-cols-2 gap-2 border-b border-(--linear-app-frame-seam) p-4 sm:grid-cols-4'>
        <StatCard
          label='Subscribers'
          value={AUDIENCE_SUMMARY.totalSubscribers.toLocaleString()}
        />
        <StatCard
          label='Email'
          value={AUDIENCE_SUMMARY.emailSubscribers.toLocaleString()}
        />
        <StatCard
          label='SMS'
          value={AUDIENCE_SUMMARY.smsSubscribers.toLocaleString()}
        />
        <StatCard
          label='Growth'
          value={`+${AUDIENCE_SUMMARY.subscriberGrowth}%`}
          positive
        />
      </div>

      {/* Member list */}
      <div>
        {/* Header */}
        <div className='flex items-center gap-3 border-b border-(--linear-app-frame-seam) bg-surface-0 px-4 py-1.5 text-2xs font-medium text-tertiary-token'>
          <span className='flex-1'>Name</span>
          <span className='w-14 text-center'>Intent</span>
          <span className='hidden w-20 sm:block'>Source</span>
          <span className='hidden w-32 md:block'>Last action</span>
          <span className='w-10 text-right'>Score</span>
        </div>

        {AUDIENCE_MEMBERS.map(member => {
          const intent = INTENT_STYLE[member.intent] ?? INTENT_STYLE.Low;
          return (
            <div
              key={member.id}
              className='flex items-center gap-3 border-b border-(--linear-app-frame-seam) px-4 py-2 text-app transition-colors duration-fast hover:bg-surface-1'
            >
              <span className='flex-1 truncate text-primary-token'>
                {member.name}
              </span>
              <span className='w-14 text-center'>
                <DotBadge
                  size='sm'
                  label={member.intent}
                  variant={intent}
                  className='mx-auto'
                />
              </span>
              <span className='hidden w-20 truncate text-2xs text-tertiary-token sm:block'>
                {member.source}
              </span>
              <span className='hidden w-32 truncate text-2xs text-tertiary-token md:block'>
                {member.lastAction}
              </span>
              <span className='w-10 text-right text-2xs text-secondary-token'>
                {member.engagementScore}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  positive,
}: {
  readonly label: string;
  readonly value: string;
  readonly positive?: boolean;
}) {
  return (
    <ContentMetricCard
      label={label}
      value={value}
      className='p-3'
      labelClassName='text-[11px] tracking-[0.04em]'
      subtitleClassName='hidden'
      valueClassName={
        positive
          ? 'text-[22px] font-[620] tracking-[-0.025em] text-[var(--color-success)]'
          : 'text-[22px] font-[620] tracking-[-0.025em]'
      }
    />
  );
}
