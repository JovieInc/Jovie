'use client';

import { ArrowDown } from 'lucide-react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';

const numberFormatter = new Intl.NumberFormat();

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
  return numberFormatter.format(num);
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
      label: 'Followers',
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
                  <span className='mt-0.5 text-2xs font-caption tabular-nums text-primary'>
                    {conversionRate}
                  </span>
                )}
              </div>
            )}

            <div
              className='relative transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]'
              style={{ width: `${widthPercent}%` }}
            >
              <ContentSurfaceCard
                className={`
                  relative overflow-hidden rounded-xl
                  bg-gradient-to-r from-(--linear-bg-surface-1) to-(--linear-bg-surface-2)
                  px-6 py-5 text-center
                  ${isLast ? '' : 'hover:border-default'}
                  ${isLast ? 'border-primary/20 ring-1 ring-primary/15 bg-gradient-to-r from-[color-mix(in_srgb,var(--linear-accent)_12%,var(--linear-bg-surface-1))] to-(--linear-bg-surface-1)' : ''}
                  transition-all duration-200
                `}
              >
                <p className='mb-2 text-app font-caption tracking-normal text-secondary-token'>
                  {stage.label}
                </p>
                <p className='text-4xl font-semibold tracking-[-0.022em] text-primary-token tabular-nums'>
                  {formatNumber(stage.value)}
                </p>
                <p className='mt-1 text-app text-secondary-token'>
                  {stage.description}
                </p>
              </ContentSurfaceCard>
            </div>
          </div>
        );
      })}
    </div>
  );
}
