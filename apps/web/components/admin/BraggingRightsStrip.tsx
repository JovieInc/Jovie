'use client';

import {
  Card,
  CardContent,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@jovie/ui';
import { Building2, Mail, MousePointerClick, Tag, Users } from 'lucide-react';
import type { AdminBraggingRights } from '@/lib/admin/bragging-rights';

interface BraggingRightsStripProps {
  readonly data: AdminBraggingRights;
}

const MAX_VISIBLE_BADGES = 3;

/**
 * Renders the first N labels/distributors as inline badges with a "+N others" overflow trigger.
 * Hovering the overflow badge shows the full list in a tooltip.
 */
function BadgeRow({
  items,
  emptyText,
  icon: Icon,
  title,
}: {
  readonly items: string[];
  readonly emptyText: string;
  readonly icon: React.ComponentType<{ className?: string }>;
  readonly title: string;
}) {
  const visible = items.slice(0, MAX_VISIBLE_BADGES);
  const overflow = items.slice(MAX_VISIBLE_BADGES);

  return (
    <div className='space-y-2'>
      <div className='flex items-center gap-1.5'>
        <Icon className='size-3.5 text-tertiary-token' />
        <p className='text-2xs tracking-wide text-tertiary-token'>{title}</p>
      </div>

      {items.length === 0 ? (
        <p className='text-app text-secondary-token'>{emptyText}</p>
      ) : (
        <div className='flex flex-wrap items-center gap-1.5'>
          {visible.map(item => (
            <span
              key={item}
              className='inline-flex items-center rounded-md bg-surface-2 px-2 py-0.5 text-2xs font-medium text-secondary-token'
            >
              {item}
            </span>
          ))}
          {overflow.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type='button'
                  className='inline-flex cursor-default items-center rounded-md bg-surface-2 px-2 py-0.5 text-2xs font-medium text-tertiary-token hover:text-secondary-token'
                  aria-label={`${overflow.length} more ${title.toLowerCase()}`}
                >
                  +{overflow.length} others
                </button>
              </TooltipTrigger>
              <TooltipContent side='top' className='max-w-xs'>
                <p className='mb-1 text-2xs font-semibold text-tertiary-token'>
                  All {title}
                </p>
                <ul className='space-y-0.5'>
                  {items.map(item => (
                    <li key={item} className='text-2xs'>
                      {item}
                    </li>
                  ))}
                </ul>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconClassName,
}: {
  readonly title: string;
  readonly value: string;
  readonly subtitle: string;
  readonly icon: React.ComponentType<{ className?: string }>;
  readonly iconClassName?: string;
}) {
  return (
    <Card className='border-subtle bg-transparent'>
      <CardContent className='space-y-1.5 p-4'>
        <div className='flex items-center gap-1.5'>
          <Icon
            className={`size-3.5 ${iconClassName ?? 'text-tertiary-token'}`}
          />
          <p className='text-2xs tracking-wide text-tertiary-token'>{title}</p>
        </div>
        <p className='text-2xl font-semibold tabular-nums tracking-tight text-primary-token'>
          {value}
        </p>
        <p className='text-app text-secondary-token'>{subtitle}</p>
      </CardContent>
    </Card>
  );
}

function formatCompact(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toLocaleString('en-US');
}

export function BraggingRightsStrip({
  data,
}: Readonly<BraggingRightsStripProps>) {
  return (
    <div className='space-y-4' data-testid='bragging-rights-strip'>
      {/* Labels + Distributors row */}
      <div className='grid gap-4 sm:grid-cols-2'>
        <Card className='border-subtle bg-transparent'>
          <CardContent className='space-y-2 p-4'>
            <BadgeRow
              items={data.labels}
              emptyText='No label data yet'
              icon={Tag}
              title='Labels'
            />
          </CardContent>
        </Card>

        <Card className='border-subtle bg-transparent'>
          <CardContent className='space-y-2 p-4'>
            <BadgeRow
              items={data.distributors}
              emptyText='No distributor data yet'
              icon={Building2}
              title='Distributors'
            />
          </CardContent>
        </Card>
      </div>

      {/* Platform stats row */}
      <div className='grid gap-4 sm:grid-cols-3'>
        <StatCard
          title='Total Visitors'
          value={formatCompact(data.totalProfileViews)}
          subtitle='Profile views across all creators'
          icon={Users}
          iconClassName='text-info'
        />
        <StatCard
          title='DSP Clicks'
          value={formatCompact(data.totalDspClicks)}
          subtitle='Smartlink clicks to music platforms'
          icon={MousePointerClick}
          iconClassName='text-accent'
        />
        <StatCard
          title='Contacts Captured'
          value={formatCompact(data.totalContactsCaptured)}
          subtitle='SMS + email subscribers across platform'
          icon={Mail}
          iconClassName='text-success'
        />
      </div>
    </div>
  );
}
