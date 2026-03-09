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
    <Card className='border-subtle bg-transparent'>
      <CardContent className='space-y-2 p-4'>
        <div className='flex items-center gap-1.5'>
          <Icon
            className={`h-4 w-4 ${iconClassName || 'text-tertiary-token'}`}
          />
          <p className='text-2xs tracking-wide text-tertiary-token'>{title}</p>
        </div>
        <p className='text-2xl font-semibold tabular-nums tracking-tight text-primary-token'>
          {value}
        </p>
        <div className='text-app text-secondary-token'>{metadata}</div>
      </CardContent>
    </Card>
  );
}
