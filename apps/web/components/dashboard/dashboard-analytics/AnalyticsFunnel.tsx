'use client';

import { ArrowDown } from 'lucide-react';

interface FunnelStage {
  label: string;
  value: number;
  description: string;
}

interface AnalyticsFunnelProps {
  readonly profileViews: number;
  readonly uniqueUsers: number;
  readonly subscribers: number;
}

function formatNumber(num: number): string {
  return Intl.NumberFormat().format(num);
}

function calculateRate(current: number, previous: number): string {
  if (previous === 0) return '0%';
  return `${Math.round((current / previous) * 100)}%`;
}

export function AnalyticsFunnel({
  profileViews,
  uniqueUsers,
  subscribers,
}: AnalyticsFunnelProps) {
  const stages: FunnelStage[] = [
    {
      label: 'Profile Views',
      value: profileViews,
      description: 'Total page visits',
    },
    {
      label: 'Unique Visitors',
      value: uniqueUsers,
      description: 'Distinct users identified',
    },
    {
      label: 'Subscribers',
      value: subscribers,
      description: 'Opted-in for notifications',
    },
  ];

  const maxValue = Math.max(...stages.map(s => s.value), 1);

  return (
    <div className='flex flex-col items-center gap-1'>
      {stages.map((stage, index) => {
        const widthPercent = Math.max((stage.value / maxValue) * 100, 20);
        const isLast = index === stages.length - 1;
        const prevStage = index > 0 ? stages[index - 1] : null;
        const conversionRate = prevStage
          ? calculateRate(stage.value, prevStage.value)
          : null;

        return (
          <div key={stage.label} className='w-full flex flex-col items-center'>
            {index > 0 && (
              <div className='flex flex-col items-center py-2'>
                <ArrowDown className='h-4 w-4 text-tertiary-token' />
                {conversionRate && (
                  <span className='text-xs font-medium text-accent mt-0.5'>
                    {conversionRate}
                  </span>
                )}
              </div>
            )}

            <div
              className='relative transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]'
              style={{ width: `${widthPercent}%` }}
            >
              <div
                className={`
                  relative overflow-hidden rounded-xl border border-subtle
                  bg-gradient-to-r from-[var(--color-bg-surface-1)] to-[var(--color-bg-surface-2)]
                  px-6 py-5 text-center
                  ${!isLast ? 'hover:border-[var(--color-border-default)]' : ''}
                  ${isLast ? 'ring-2 ring-accent/20 border-accent/30 bg-gradient-to-r from-[var(--color-accent-subtle)] to-[var(--color-bg-surface-1)]' : ''}
                  transition-all duration-200
                `}
              >
                <p className='text-xs font-semibold uppercase tracking-[0.15em] text-tertiary-token mb-2'>
                  {stage.label}
                </p>
                <p className='text-4xl font-extrabold tracking-tight text-primary-token'>
                  {formatNumber(stage.value)}
                </p>
                <p className='text-xs text-secondary-token mt-1'>
                  {stage.description}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
