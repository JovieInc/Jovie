import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { ContentMetricCard } from '@/components/molecules/ContentMetricCard';

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
    <ContentMetricCard
      label={title}
      value={value}
      subtitle={metadata}
      icon={Icon}
      iconClassName={iconClassName}
    />
  );
}
