import Link from 'next/link';
import React from 'react';
import { IconBadge } from '@/components/atoms/IconBadge';
import type { Feature } from '@/lib/features';

interface FlyoutItemProps {
  feature: Feature;
  className?: string;
  style?: React.CSSProperties;
}

export const FlyoutItem = React.forwardRef<HTMLAnchorElement, FlyoutItemProps>(
  ({ feature, className = '', style }, ref) => {
    return (
      <Link
        ref={ref}
        href={feature.href}
        className={`group relative flex items-start gap-3 rounded-lg p-3 transition-all duration-200 hover:scale-[1.02] hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${className}`}
        style={
          {
            ...style,
            '--ring-color': `color-mix(in srgb, var(${feature.colorVar}) 25%, transparent)`,
          } as React.CSSProperties & { '--ring-color': string }
        }
        role='menuitem'
      >
        <div className='flex-shrink-0'>
          <IconBadge name={feature.icon} colorVar={feature.colorVar} />
        </div>
        <div className='min-w-0 flex-1'>
          <div className='flex items-center gap-2'>
            <h3 className='text-sm font-semibold text-[var(--fg)] group-hover:text-[var(--fg)]'>
              {feature.title}
            </h3>
            {feature.aiPowered && (
              <span className='inline-flex items-center rounded-md bg-gradient-to-r from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300 ring-1 ring-inset ring-blue-700/10 dark:ring-blue-300/20'>
                AI-powered
              </span>
            )}
          </div>
          <p className='mt-1 text-xs text-[var(--muted)] group-hover:text-[var(--muted)]'>
            {feature.blurb}
          </p>
        </div>
      </Link>
    );
  }
);

FlyoutItem.displayName = 'FlyoutItem';
