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
}: KpiItemProps) {
  return (
    <div className='space-y-1.5'>
      <div className='flex items-center gap-1.5'>
        <Icon className={`h-3 w-3 ${iconClassName || 'text-tertiary-token'}`} />
        <dt className='text-xs text-tertiary-token'>{title}</dt>
      </div>
      <dd className='text-2xl font-semibold tabular-nums text-primary-token'>
        {value}
      </dd>
      <div className='text-xs text-secondary-token'>{metadata}</div>
    </div>
  );
}
