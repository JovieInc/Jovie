import { BarChart3 } from 'lucide-react';
import type { ComponentType, ReactNode, SVGProps } from 'react';
import { ContentMetricCard } from '@/components/molecules/ContentMetricCard';

interface AnalyticsCardProps {
  readonly title: string;
  readonly value: number | string;
  readonly metadata?: ReactNode;
  readonly order?: string;
  readonly icon?: ComponentType<SVGProps<SVGSVGElement>>;
  readonly iconClassName?: string;
  readonly iconChipClassName?: string;
  readonly headerRight?: ReactNode;
  readonly children?: ReactNode;
}

const FallbackIcon = BarChart3;

export function AnalyticsCard({
  title,
  value,
  metadata,
  order,
  icon: IconComponent,
  iconClassName,
  iconChipClassName,
  headerRight,
  children,
}: AnalyticsCardProps) {
  const IconToRender = IconComponent ?? FallbackIcon;

  return (
    <ContentMetricCard
      as='section'
      className={order}
      label={title}
      value={value}
      subtitle={children ?? metadata}
      icon={IconToRender}
      iconClassName={iconClassName ?? 'text-accent-token'}
      headerRight={headerRight}
      headerClassName='gap-2'
      labelClassName='text-[13px] text-secondary-token tracking-[-0.01em]'
      valueClassName='text-3xl font-[590] tracking-[-0.022em]'
      subtitleClassName='text-[13px] text-tertiary-token'
      aria-label={`${title} metric`}
    />
  );
}
