import { Tooltip, TooltipContent, TooltipTrigger } from '@jovie/ui';
import { Building2 } from 'lucide-react';
import { ContentMetricStat } from '@/components/molecules/ContentMetricStat';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import type { AdminPlatformStats } from '@/lib/admin/platform-stats';

interface PlatformStatsStripProps {
  readonly stats: AdminPlatformStats;
}

interface StatItemProps {
  readonly value: number;
  readonly label: string;
}

function StatItem({ value, label }: Readonly<StatItemProps>) {
  return (
    <ContentMetricStat
      label={label}
      value={value.toLocaleString('en-US')}
      valueClassName='text-[32px] font-[620] leading-none tracking-[-0.035em] text-(--linear-text-primary) tabular-nums'
      labelClassName='text-[12px] leading-[17px] tracking-[-0.01em] text-(--linear-text-secondary)'
    />
  );
}

function getUsageCopy(stats: AdminPlatformStats): string {
  const badgeList = stats.labelBadges;
  if (badgeList.length === 0) {
    return 'Used by artists across the global independent music ecosystem';
  }

  const [first, second, third] = badgeList;

  if (stats.labelsOnPlatform <= 3 || !third) {
    if (!second) return `Used by artists on ${first}`;
    if (!third) return `Used by artists on ${first} and ${second}`;
    return `Used by artists on ${first}, ${second}, and ${third}`;
  }

  return `Used by artists on ${first}, ${second}, and ${stats.labelsOnPlatform - 2} others`;
}

export function PlatformStatsStrip({
  stats,
}: Readonly<PlatformStatsStripProps>) {
  return (
    <ContentSurfaceCard
      data-testid='platform-stats-strip'
      className='space-y-6 p-5'
    >
      <div className='grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7'>
        <StatItem value={stats.labelsOnPlatform} label='Labels on platform' />
        <StatItem
          value={stats.totalUniqueVisitors}
          label='Total unique visitors'
        />
        <StatItem value={stats.dspClicksDriven} label='DSP clicks driven' />
        <StatItem value={stats.contactsCaptured} label='Contacts captured' />
        <StatItem
          value={stats.creatorsOnPlatform}
          label='Creators on platform'
        />
        <StatItem value={stats.releasesTracked} label='Releases tracked' />
        <StatItem value={stats.tracksTracked} label='Tracks tracked' />
      </div>

      <div className='space-y-3 border-t border-(--linear-border-subtle) pt-4'>
        <p className='flex items-center gap-2 text-app font-medium text-secondary-token'>
          <Building2 className='size-4 text-tertiary-token' />
          {getUsageCopy(stats)}
        </p>

        {stats.labelBadges.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className='flex cursor-help flex-wrap items-center gap-2'>
                {stats.labelBadges.map(label => (
                  <span
                    key={label}
                    className='inline-flex items-center rounded-[8px] border border-(--linear-border-subtle) bg-(--linear-bg-surface-0) px-2 py-0.5 text-2xs font-medium text-secondary-token'
                  >
                    {label}
                  </span>
                ))}
                {stats.labelsOnPlatform > stats.labelBadges.length && (
                  <span className='inline-flex items-center rounded-[8px] border border-(--linear-border-subtle) bg-(--linear-bg-surface-0) px-2 py-0.5 text-2xs font-medium text-secondary-token'>
                    +{stats.labelsOnPlatform - stats.labelBadges.length}
                  </span>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent
              side='top'
              className='w-[min(32rem,calc(100vw-2rem))] p-3'
            >
              <p className='mb-2 text-xs font-medium text-tertiary-token'>
                All labels and distributors
              </p>
              <ul className='max-h-60 space-y-1 overflow-y-auto pr-1'>
                {stats.allLabelsAndDistributors.map(name => (
                  <li
                    key={name}
                    className='truncate text-xs text-secondary-token'
                  >
                    {name}
                  </li>
                ))}
              </ul>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </ContentSurfaceCard>
  );
}
