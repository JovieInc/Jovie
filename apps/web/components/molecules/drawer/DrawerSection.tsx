'use client';

import { type ReactNode, useId, useState } from 'react';
import { cn } from '@/lib/utils';
import { CollapsibleSectionHeading } from './CollapsibleSectionHeading';
import { DrawerSectionHeading } from './DrawerSectionHeading';

export interface DrawerSectionProps {
  readonly title?: string;
  readonly children: ReactNode;
  readonly className?: string;
  /** Whether the section can be collapsed. Defaults to true when title is provided. */
  readonly collapsible?: boolean;
  /** Whether the section starts open. Defaults to true. */
  readonly defaultOpen?: boolean;
}

export function DrawerSection({
  title,
  children,
  className,
  collapsible,
  defaultOpen = true,
}: DrawerSectionProps) {
  const isCollapsible = collapsible ?? !!title;
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <div className={cn('space-y-1.5', className)}>
      {title ? (
        isCollapsible ? (
          <CollapsibleSectionHeading
            isOpen={isOpen}
            onToggle={() => setIsOpen(prev => !prev)}
            aria-controls={contentId}
          >
            {title}
          </CollapsibleSectionHeading>
        ) : (
          <DrawerSectionHeading>{title}</DrawerSectionHeading>
        )
      ) : null}
      <div id={contentId} hidden={isCollapsible && !isOpen}>
        {children}
      </div>
    </div>
  );
}
