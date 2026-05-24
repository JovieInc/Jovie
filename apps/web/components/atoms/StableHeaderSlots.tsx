import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export type StableHeaderLineCount = 1 | 2;

const TEXT_SLOT_HEIGHT_CLASSNAME: Record<
  'xs' | 'sm' | 'md',
  Record<StableHeaderLineCount, string>
> = {
  xs: {
    1: 'min-h-[16px]',
    2: 'min-h-[32px]',
  },
  sm: {
    1: 'min-h-[18px]',
    2: 'min-h-[36px]',
  },
  md: {
    1: 'min-h-[22px]',
    2: 'min-h-[44px]',
  },
};

export const STABLE_HEADER_LINE_CLAMP_CLASSNAME: Record<
  StableHeaderLineCount,
  string
> = {
  1: 'line-clamp-1',
  2: 'line-clamp-2',
};

export const STABLE_HEADER_TITLE_HEIGHT_CLASSNAME: Record<
  StableHeaderLineCount,
  string
> = {
  1: TEXT_SLOT_HEIGHT_CLASSNAME.md[1],
  2: TEXT_SLOT_HEIGHT_CLASSNAME.md[2],
};

const TEXT_SLOT_OVERFLOW_CLASSNAME: Record<StableHeaderLineCount, string> = {
  1: 'truncate',
  2: STABLE_HEADER_LINE_CLAMP_CLASSNAME[2],
};

interface StableHeaderTextSlotProps {
  readonly children?: ReactNode;
  readonly reserve?: boolean;
  readonly lineCount?: StableHeaderLineCount;
  readonly size?: 'xs' | 'sm' | 'md';
  readonly className?: string;
  readonly testId?: string;
}

export function StableHeaderTextSlot({
  children,
  reserve = false,
  lineCount,
  size = 'xs',
  className,
  testId,
}: StableHeaderTextSlotProps) {
  const hasContent = children != null && children !== false;

  if (!hasContent && !reserve) {
    return null;
  }

  return (
    <div
      aria-hidden={hasContent ? undefined : true}
      data-testid={testId}
      className={cn(
        'min-w-0',
        lineCount && TEXT_SLOT_HEIGHT_CLASSNAME[size][lineCount],
        lineCount && TEXT_SLOT_OVERFLOW_CLASSNAME[lineCount],
        !hasContent && 'invisible',
        className
      )}
    >
      {hasContent ? children : '\u00a0'}
    </div>
  );
}

interface StableHeaderChipRailProps {
  readonly children?: ReactNode;
  readonly reserve?: boolean;
  readonly className?: string;
  readonly contentClassName?: string;
  readonly testId?: string;
}

export function StableHeaderChipRail({
  children,
  reserve = false,
  className,
  contentClassName,
  testId,
}: StableHeaderChipRailProps) {
  const hasContent = children != null && children !== false;

  if (!hasContent && !reserve) {
    return null;
  }

  return (
    <div
      aria-hidden={hasContent ? undefined : true}
      data-testid={testId}
      className={cn('relative min-w-0', !hasContent && 'invisible', className)}
    >
      <div
        className={cn(
          'flex min-h-[22px] max-w-full items-center gap-1.5 overflow-x-auto overflow-y-hidden whitespace-nowrap pr-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0 [&_*]:whitespace-nowrap',
          '[mask-image:linear-gradient(to_right,black_calc(100%_-_18px),transparent)] [-webkit-mask-image:linear-gradient(to_right,black_calc(100%_-_18px),transparent)]',
          contentClassName
        )}
      >
        {hasContent ? children : <span>{'\u00a0'}</span>}
      </div>
    </div>
  );
}
