'use client';

import {
  AUDIENCE_MEMBERS,
  AUDIENCE_SUMMARY,
} from '@/components/home/demo/mock-data';

const INTENT_STYLE: Record<string, { bg: string; text: string }> = {
  High: { bg: 'var(--color-success)', text: '#fff' },
  Medium: { bg: 'var(--color-warning)', text: '#000' },
  Low: { bg: 'var(--linear-text-quaternary)', text: '#fff' },
};

export function DemoAudiencePanel() {
  return (
    <div className='h-full overflow-y-auto'>
      {/* Summary cards */}
      <div className='grid grid-cols-2 gap-3 border-b border-(--linear-border-subtle) p-4 sm:grid-cols-4'>
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
        <div className='flex items-center gap-3 border-b border-(--linear-border-subtle) bg-(--linear-bg-surface-1) px-4 py-1.5 text-2xs font-medium text-(--linear-text-tertiary)'>
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
              className='flex items-center gap-3 border-b border-(--linear-border-subtle) px-4 py-2 text-app transition-colors duration-fast hover:bg-(--linear-bg-surface-2)'
            >
              <span className='flex-1 truncate text-(--linear-text-primary)'>
                {member.name}
              </span>
              <span className='w-14 text-center'>
                <span
                  className='inline-block rounded-xs px-1.5 py-0.5 text-[10px] font-medium'
                  style={{
                    backgroundColor: intent.bg,
                    color: intent.text,
                    opacity: 0.85,
                  }}
                >
                  {member.intent}
                </span>
              </span>
              <span className='hidden w-20 truncate text-2xs text-(--linear-text-tertiary) sm:block'>
                {member.source}
              </span>
              <span className='hidden w-32 truncate text-2xs text-(--linear-text-tertiary) md:block'>
                {member.lastAction}
              </span>
              <span className='w-10 text-right text-2xs text-(--linear-text-secondary)'>
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
    <div className='rounded-md border border-(--linear-border-default) bg-(--linear-bg-surface-0) p-3'>
      <p className='text-2xs text-(--linear-text-tertiary)'>{label}</p>
      <p
        className='mt-1 text-lg font-semibold'
        style={{
          color: positive
            ? 'var(--color-success)'
            : 'var(--linear-text-primary)',
        }}
      >
        {value}
      </p>
    </div>
  );
}
