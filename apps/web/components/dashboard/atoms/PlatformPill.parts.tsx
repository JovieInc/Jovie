/**
 * PlatformPill Sub-components
 *
 * Extracted to reduce cognitive complexity of the main component.
 */

import type { CSSProperties, ReactNode } from 'react';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { cn } from '@/lib/utils';

/**
 * Shimmer overlay effect for newly added pills
 */
export function PillShimmer({ show }: Readonly<{ show: boolean }>) {
  if (!show) return null;

  return (
    <span
      aria-hidden='true'
      className='pointer-events-none absolute inset-0 animate-shimmer motion-reduce:animate-none opacity-30 dark:opacity-20'
      style={{
        backgroundImage:
          'linear-gradient(90deg, transparent, rgba(255,255,255,0.28), transparent)',
        backgroundSize: '200% 100%',
      }}
    />
  );
}

/**
 * Props for PillIcon component
 */
export interface PillIconProps {
  readonly platformIcon: string;
  readonly style: CSSProperties;
}

/**
 * Platform icon chip
 */
export function PillIcon({ platformIcon, style }: Readonly<PillIconProps>) {
  return (
    <span
      className='flex shrink-0 items-center justify-center rounded-lg bg-surface-2/60 p-0.5 transition-colors'
      style={style}
      aria-hidden='true'
    >
      <SocialIcon platform={platformIcon} className='h-3.5 w-3.5' />
    </span>
  );
}

/**
 * Props for CollapsedContent component
 */
export interface CollapsedContentProps {
  readonly defaultExpanded: boolean;
  readonly primaryText: string;
}

/**
 * Content displayed in collapsed mode (icon-only, expands on hover)
 */
export function CollapsedContent({
  defaultExpanded,
  primaryText,
}: Readonly<CollapsedContentProps>) {
  return (
    <span
      className={cn(
        'whitespace-nowrap overflow-hidden transition-all duration-200',
        !defaultExpanded &&
          'w-0 opacity-0 group-hover/pill:w-auto group-hover/pill:opacity-100',
        defaultExpanded && 'w-auto opacity-100'
      )}
    >
      {primaryText}
    </span>
  );
}

/**
 * Props for ExpandedContent component
 */
export interface ExpandedContentProps {
  readonly primaryText: string;
  readonly secondaryText?: string;
  readonly badgeText?: string;
  readonly suffix?: ReactNode;
}

/**
 * Content displayed in expanded mode (full layout)
 */
export function ExpandedContent({
  primaryText,
  secondaryText,
  badgeText,
  suffix,
}: Readonly<ExpandedContentProps>) {
  const hasSecondary = Boolean(
    secondaryText && secondaryText.trim().length > 0
  );

  return (
    <div className='flex items-center gap-1.5 overflow-hidden flex-1 min-w-0'>
      <div className='min-w-0 flex-1'>
        <span className={cn(primaryText.length > 40 && 'truncate')}>
          {primaryText}
        </span>
        {hasSecondary ? (
          <span
            className={cn(
              'ml-2 text-[10px] text-tertiary-token/80',
              secondaryText && secondaryText.length > 40 && 'truncate'
            )}
          >
            {secondaryText}
          </span>
        ) : null}
      </div>

      {badgeText ? (
        <span className='shrink-0 rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-secondary-token ring-1 ring-subtle'>
          {badgeText}
        </span>
      ) : null}

      {suffix ? (
        <span className='ml-0.5 shrink-0 text-[10px]' aria-hidden='true'>
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Props for TrailingContent component
 */
export interface TrailingContentProps {
  readonly children: ReactNode;
  readonly collapsed: boolean;
}

/**
 * Trailing content (action buttons, etc.)
 */
export function TrailingContent({
  children,
  collapsed,
}: Readonly<TrailingContentProps>) {
  if (collapsed) return null;
  return <div className='relative ml-1 shrink-0'>{children}</div>;
}
