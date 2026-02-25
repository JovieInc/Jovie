import { Card, CardContent } from '@jovie/ui';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export interface KpiItemProps {
  readonly title: string;
  readonly value: string;
  readonly metadata: ReactNode;
  readonly icon: LucideIcon;
  readonly iconClassName?: string;
}

export function KpiItem({
  title,
  value,
  metadata,
  icon: Icon,
  iconClassName,
}: Readonly<KpiItemProps>) {
  return (
    <Card className='border-subtle bg-surface-1/90'>
      <CardContent className='space-y-2 p-4'>
        <div className='flex items-center gap-1.5'>
          <Icon
            className={`h-3.5 w-3.5 ${iconClassName || 'text-tertiary-token'}`}
          />
          <dt className='text-2xs tracking-wide text-tertiary-token'>
            {title}
          </dt>
        </div>
        <dd className='text-2xl font-semibold tabular-nums tracking-tight text-primary-token'>
          {value}
        </dd>
        <div className='text-app text-secondary-token'>{metadata}</div>
      </CardContent>
    </Card>
  );
}
