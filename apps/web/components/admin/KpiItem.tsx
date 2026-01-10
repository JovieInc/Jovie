import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export interface KpiItemProps {
  title: string;
  value: string;
  metadata: ReactNode;
  icon: LucideIcon;
  iconClassName?: string;
  iconChipClassName?: string;
}

export function KpiItem({
  title,
  value,
  metadata,
  icon: Icon,
  iconClassName,
  iconChipClassName,
}: KpiItemProps) {
  return (
    <div className='flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0'>
      <div className='flex items-center gap-3'>
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-full ${iconChipClassName || 'bg-surface-2'}`}
        >
          <Icon className={`h-5 w-5 ${iconClassName || ''}`} />
        </div>
        <div>
          <dt className='text-xs font-semibold uppercase tracking-wide text-tertiary-token'>
            {title}
          </dt>
          <dd className='text-2xl font-semibold tabular-nums text-primary-token'>
            {value}
          </dd>
        </div>
      </div>
      <div className='text-xs text-tertiary-token'>{metadata}</div>
    </div>
  );
}
