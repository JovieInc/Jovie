import { Tooltip, TooltipContent, TooltipTrigger } from '@jovie/ui';
import { Building2 } from 'lucide-react';
import { ContentMetricCard } from '@/components/molecules/ContentMetricCard';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import type { AdminPlatformStats } from '@/lib/admin/platform-stats';

interface PlatformStatsStripProps {
  readonly stats: AdminPlatformStats;
}

interface StatCardProps {
  readonly value: number;
  readonly label: string;
}

function StatCard({ value, label }: Readonly<StatCardProps>) {
  return (
    <ContentMetricCard
      label={label}
      value={value.toLocaleString('en-US')}
      className='p-3'
      bodyClassName='space-y-1'
      valueClassName='text-[30px] font-[620] leading-none tracking-[-0.034em] text-primary-token tabular-nums'
      labelClassName='text-[11px] font-[510] tracking-[0.04em] text-tertiary-token'
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
    <div data-testid='platform-stats-strip' className='space-y-4'>
      <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7'>
        <StatCard value={stats.labelsOnPlatform} label='Labels on platform' />
        <StatCard
          value={stats.totalUniqueVisitors}
          label='Total unique visitors'
        />
        <StatCard value={stats.dspClicksDriven} label='DSP clicks driven' />
        <StatCard value={stats.contactsCaptured} label='Contacts captured' />
        <StatCard
          value={stats.creatorsOnPlatform}
          label='Creators on platform'
        />
        <StatCard value={stats.releasesTracked} label='Releases tracked' />
        <StatCard value={stats.tracksTracked} label='Tracks tracked' />
      </div>

      <ContentSurfaceCard className='space-y-2 p-3'>
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
                    className='inline-flex items-center rounded bg-surface-0 px-1.5 py-0.5 text-2xs font-medium text-secondary-token'
                  >
                    {label}
                  </span>
                ))}
                {stats.labelsOnPlatform > stats.labelBadges.length && (
                  <span className='inline-flex items-center rounded-md border border-subtle bg-surface-0 px-2 py-0.5 text-2xs font-medium text-secondary-token'>
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
      </ContentSurfaceCard>
    </div>
  );
}
