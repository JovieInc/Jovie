import Link from 'next/link';
import React from 'react';
import { IconBadge } from '@/components/atoms/IconBadge';
import type { Feature } from '@/lib/features';

interface FlyoutItemProps {
  readonly feature: Feature;
  readonly className?: string;
  readonly style?: React.CSSProperties;
}

export const FlyoutItem = React.forwardRef<HTMLAnchorElement, FlyoutItemProps>(
  ({ feature, className = '', style }, ref) => {
    return (
      <Link
        ref={ref}
        href={feature.href}
        className={`group relative flex items-start gap-3 p-3 transition-colors duration-150 focus-ring-themed ${className}`}
        style={style}
        role='menuitem'
      >
        <div className='shrink-0'>
          <IconBadge name={feature.icon} colorVar={feature.colorVar} />
        </div>
        <div className='min-w-0 flex-1'>
          <div className='flex items-center gap-2'>
            <h3 className='text-sm font-semibold text-primary-token'>
              {feature.title}
            </h3>
            {feature.aiPowered && (
              <span className='inline-flex items-center rounded-md bg-linear-to-r from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300 ring-1 ring-inset ring-blue-700/10 dark:ring-blue-300/20'>
                AI-powered
              </span>
            )}
          </div>
          <p className='mt-0.5 text-xs text-tertiary-token'>{feature.blurb}</p>
        </div>
      </Link>
    );
  }
);

FlyoutItem.displayName = 'FlyoutItem';
