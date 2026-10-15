import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { cn } from '@/lib/utils';

/** Shared frame geometry for loaded metrics and their skeletons. */
export const contentMetricCardVariants = cva('', {
  variants: {
    layout: {
      default: 'p-3.5',
      'icon-chip': 'p-3.5 sm:p-4',
      'icon-chip-inline': 'flex items-center gap-3 bg-surface-0 px-4 py-3.5',
    },
    density: { default: '', compact: '' },
    appearance: {
      card: '',
      plain: 'border-0 bg-transparent shadow-none',
    },
  },
  compoundVariants: [
    { layout: 'icon-chip', density: 'compact', className: 'p-2.5 sm:p-2.5' },
  ],
  defaultVariants: {
    layout: 'default',
    density: 'default',
    appearance: 'card',
  },
});

const iconTones = {
  accent: { icon: 'text-accent', chip: 'bg-accent/10' },
  destructive: { icon: 'text-destructive', chip: 'bg-destructive/10' },
  info: { icon: 'text-info', chip: 'bg-info/10' },
  secondary: { icon: 'text-secondary-token', chip: 'bg-secondary/10' },
  success: { icon: 'text-success', chip: 'bg-success/10' },
} as const;

export interface ContentMetricCardProps
  extends VariantProps<typeof contentMetricCardVariants> {
  /** Chip layouts retain the inline admin and stacked dashboard metric families. */
  readonly layout?: 'default' | 'icon-chip' | 'icon-chip-inline';
  readonly density?: 'default' | 'compact';
  readonly appearance?: 'card' | 'plain';
  readonly tone?: keyof typeof iconTones;
  readonly label: ReactNode;
  readonly value: ReactNode;
  readonly subtitle?: ReactNode;
  readonly icon?: React.ComponentType<{ className?: string }>;
  readonly iconClassName?: string;
  readonly headerRight?: ReactNode;
  readonly as?: ElementType;
  readonly className?: string;
  readonly bodyClassName?: string;
  readonly headerClassName?: string;
  readonly labelClassName?: string;
  readonly valueClassName?: string;
  readonly subtitleClassName?: string;
  readonly id?: string;
  readonly role?: string;
  readonly 'aria-label'?: ComponentPropsWithoutRef<'section'>['aria-label'];
  readonly 'data-testid'?: string;
}

export function ContentMetricCard({
  layout = 'default',
  density = 'default',
  appearance = 'card',
  tone = 'secondary',
  label,
  value,
  subtitle,
  icon: Icon,
  iconClassName,
  headerRight,
  as,
  className,
  bodyClassName,
  headerClassName,
  labelClassName,
  valueClassName,
  subtitleClassName,
  ...props
}: Readonly<ContentMetricCardProps>) {
  if (layout !== 'default') {
    const inline = layout === 'icon-chip-inline';
    const compact = density === 'compact';
    const chip = Icon ? (
      <div
        className={cn(
          'flex shrink-0 items-center justify-center',
          inline
            ? 'size-8 rounded-full'
            : 'size-7 border border-subtle bg-surface-1',
          !inline && (compact ? 'rounded-md' : 'rounded-lg'),
          inline && iconTones[tone].chip
        )}
        aria-hidden='true'
      >
        <Icon
          className={cn(
            inline ? 'size-4' : 'size-3.5',
            inline && tone === 'success'
              ? 'text-success-token'
              : iconTones[tone].icon,
            iconClassName
          )}
        />
      </div>
    ) : null;

    return (
      <ContentSurfaceCard
        as={as}
        className={cn(
          contentMetricCardVariants({ layout, density, appearance }),
          className
        )}
        {...props}
      >
        {inline ? chip : null}
        <dl
          className={cn(
            'min-w-0',
            !inline && 'flex h-full flex-col',
            bodyClassName
          )}
        >
          <dt className={cn('flex items-center gap-2', headerClassName)}>
            {inline ? null : chip}
            <span
              className={cn(
                'min-w-0 truncate text-app text-secondary-token',
                inline ? 'font-semibold tracking-normal' : 'font-caption',
                labelClassName
              )}
            >
              {label}
            </span>
            {headerRight ? (
              <span className='ml-auto shrink-0'>{headerRight}</span>
            ) : null}
          </dt>
          <dd
            className={cn(
              'font-semibold tabular-nums text-primary-token',
              inline
                ? 'text-mid leading-tight'
                : 'mt-2 text-2xl leading-none tracking-[-0.011em]',
              !inline && !compact && 'sm:text-3xl',
              valueClassName
            )}
          >
            {value}
          </dd>
          {subtitle ? (
            <dd
              className={cn(
                'mt-1.5 text-2xs leading-4 text-tertiary-token sm:text-app',
                subtitleClassName
              )}
            >
              {subtitle}
            </dd>
          ) : null}
        </dl>
      </ContentSurfaceCard>
    );
  }

  return (
    <ContentSurfaceCard
      as={as}
      className={cn(
        contentMetricCardVariants({ layout, density, appearance }),
        className
      )}
      {...props}
    >
      <div className={cn('space-y-1', bodyClassName)}>
        <div className={cn('flex items-center gap-1.5', headerClassName)}>
          <div className='min-w-0 flex items-center gap-1.5'>
            {Icon ? (
              <Icon
                className={cn(
                  'size-3.5 shrink-0 text-tertiary-token',
                  iconClassName
                )}
              />
            ) : null}
            <p
              className={cn(
                'truncate text-2xs font-semibold tracking-normal text-tertiary-token',
                labelClassName
              )}
            >
              {label}
            </p>
          </div>
          {headerRight ? (
            <div className='ml-auto shrink-0'>{headerRight}</div>
          ) : null}
        </div>
        <p
          className={cn(
            'text-2xl font-semibold leading-none tracking-[-0.03em] text-primary-token tabular-nums',
            valueClassName
          )}
        >
          {value}
        </p>
        {subtitle ? (
          <div
            className={cn(
              'text-xs leading-4 text-secondary-token',
              subtitleClassName
            )}
          >
            {subtitle}
          </div>
        ) : null}
      </div>
    </ContentSurfaceCard>
  );
}
