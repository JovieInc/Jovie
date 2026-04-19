'use client';

import { type ReactNode, useCallback, useEffect, useId, useState } from 'react';
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
  readonly headingTestId?: string;
}

interface DrawerSectionHeadingSlotProps {
  readonly title?: string;
  readonly isCollapsible: boolean;
  readonly isOpen: boolean;
  readonly onToggle: () => void;
  readonly contentId: string;
  readonly testId?: string;
}

function DrawerSectionHeadingSlot({
  title,
  isCollapsible,
  isOpen,
  onToggle,
  contentId,
  testId,
}: DrawerSectionHeadingSlotProps) {
  if (!title) {
    return null;
  }

  if (isCollapsible) {
    return (
      <CollapsibleSectionHeading
        isOpen={isOpen}
        onToggle={onToggle}
        aria-controls={contentId}
        data-testid={testId}
        className='min-w-0 flex-1'
      >
        {title}
      </CollapsibleSectionHeading>
    );
  }

  return (
    <DrawerSectionHeading className='min-w-0 flex-1'>
      {title}
    </DrawerSectionHeading>
  );
}

interface DrawerSectionHeaderProps {
  readonly title?: string;
  readonly heading: ReactNode;
  readonly actions?: ReactNode;
  readonly isCard: boolean;
  readonly isCollapsible: boolean;
}

function DrawerSectionHeader({
  title,
  heading,
  actions,
  isCard,
  isCollapsible,
}: DrawerSectionHeaderProps) {
  if (!title) {
    return null;
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2',
        isCard && 'min-h-8 py-1.5',
        isCard && (isCollapsible ? 'pr-2.5' : 'px-2.5')
      )}
    >
      {heading}
      {actions ? <div className='shrink-0'>{actions}</div> : null}
    </div>
  );
}

interface DrawerSectionContentProps {
  readonly contentId: string;
  readonly isHidden: boolean;
  readonly shouldRenderContent: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}

function DrawerSectionContent({
  contentId,
  isHidden,
  shouldRenderContent,
  className,
  children,
}: DrawerSectionContentProps) {
  return (
    <div id={contentId} hidden={isHidden} className={className}>
      {shouldRenderContent ? children : null}
    </div>
  );
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
  headingTestId,
}: DrawerSectionProps) {
  const isCollapsible = collapsible ?? !!title;
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [hasOpened, setHasOpened] = useState(defaultOpen);
  const contentId = useId();
  const shouldRenderContent = !lazyMount || isOpen || hasOpened;
  const handleToggle = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setHasOpened(true);
    }
  }, [isOpen]);

  const heading = (
    <DrawerSectionHeadingSlot
      title={title}
      isCollapsible={isCollapsible}
      isOpen={isOpen}
      onToggle={handleToggle}
      contentId={contentId}
      testId={headingTestId}
    />
  );
  const isContentHidden = isCollapsible && !isOpen;

  if (surface === 'card') {
    return (
      <div className={cn('space-y-2', className)}>
        <DrawerSurfaceCard
          variant='card'
          testId={testId}
          className={cn('overflow-hidden', surfaceClassName)}
        >
          <DrawerSectionHeader
            title={title}
            heading={heading}
            actions={actions}
            isCard
            isCollapsible={isCollapsible}
          />
          <DrawerSectionContent
            contentId={contentId}
            isHidden={isContentHidden}
            shouldRenderContent={shouldRenderContent}
            className={cn(title ? 'px-2.5 pb-2.5' : 'p-2.5', contentClassName)}
          >
            {children}
          </DrawerSectionContent>
        </DrawerSurfaceCard>
      </div>
    );
  }

  return (
    <div data-testid={testId} className={cn('space-y-2', className)}>
      <DrawerSectionHeader
        title={title}
        heading={heading}
        actions={actions}
        isCard={false}
        isCollapsible={isCollapsible}
      />
      <DrawerSectionContent
        contentId={contentId}
        isHidden={isContentHidden}
        shouldRenderContent={shouldRenderContent}
        className={contentClassName}
      >
        {children}
      </DrawerSectionContent>
    </div>
  );
}
