'use client';

import { type ReactNode, useCallback, useId, useState } from 'react';
import { cn } from '@/lib/utils';
import { CollapsibleSectionHeading } from './CollapsibleSectionHeading';
import { DrawerSectionHeading } from './DrawerSectionHeading';
import { DrawerSurfaceCard } from './DrawerSurfaceCard';

export interface DrawerSectionProps {
  readonly title?: string;
  readonly children: ReactNode;
  readonly actions?: ReactNode;
  readonly className?: string;
  readonly contentClassName?: string;
  readonly surface?: 'plain' | 'card';
  readonly surfaceClassName?: string;
  readonly testId?: string;
  /** Whether the section can be collapsed. Defaults to true when title is provided. */
  readonly collapsible?: boolean;
  /** Whether the section starts open. Defaults to true. */
  readonly defaultOpen?: boolean;
  /** Delay mounting collapsed content until the first time it opens. */
  readonly lazyMount?: boolean;
}

export function DrawerSection({
  title,
  children,
  actions,
  className,
  contentClassName,
  surface = 'plain',
  surfaceClassName,
  testId,
  collapsible,
  defaultOpen = true,
  lazyMount = false,
}: DrawerSectionProps) {
  const isCollapsible = collapsible ?? !!title;
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [hasOpened, setHasOpened] = useState(defaultOpen);
  const contentId = useId();
  const shouldRenderContent = !lazyMount || isOpen || hasOpened;
  const handleToggle = useCallback(() => {
    setIsOpen(prev => {
      const nextOpen = !prev;
      if (nextOpen) {
        setHasOpened(true);
      }
      return nextOpen;
    });
  }, []);
  const heading = title ? (
    isCollapsible ? (
      <CollapsibleSectionHeading
        isOpen={isOpen}
        onToggle={handleToggle}
        aria-controls={contentId}
        className='min-w-0 flex-1'
      >
        {title}
      </CollapsibleSectionHeading>
    ) : (
      <DrawerSectionHeading className='min-w-0 flex-1'>
        {title}
      </DrawerSectionHeading>
    )
  ) : null;

  if (surface === 'card') {
    return (
      <div className={cn('space-y-2', className)}>
        <DrawerSurfaceCard
          variant='card'
          testId={testId}
          className={cn('overflow-hidden', surfaceClassName)}
        >
          {title ? (
            <div className='flex min-h-8 items-center gap-2 px-2.5 py-1.5'>
              {heading}
              {actions ? <div className='shrink-0'>{actions}</div> : null}
            </div>
          ) : null}
          <div
            id={contentId}
            hidden={isCollapsible && !isOpen}
            className={cn(title ? 'px-2.5 pb-2.5' : 'p-2.5', contentClassName)}
          >
            {shouldRenderContent ? children : null}
          </div>
        </DrawerSurfaceCard>
      </div>
    );
  }

  return (
    <div data-testid={testId} className={cn('space-y-2', className)}>
      {title ? (
        <div className='flex items-center gap-2'>
          {heading}
          {actions ? <div className='shrink-0'>{actions}</div> : null}
        </div>
      ) : null}
      <div
        id={contentId}
        hidden={isCollapsible && !isOpen}
        className={contentClassName}
      >
        {shouldRenderContent ? children : null}
      </div>
    </div>
  );
}
