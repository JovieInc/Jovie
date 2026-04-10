'use client';

import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import type { TocEntry } from '@/types/docs';

export interface PublicTableOfContentsProps {
  readonly toc: TocEntry[];
  readonly ariaLabel?: string;
  readonly className?: string;
  readonly stickyClassName?: string;
  readonly trackActiveHeading?: boolean;
}

export function PublicTableOfContents({
  toc,
  ariaLabel = 'Table of contents',
  className,
  stickyClassName,
  trackActiveHeading = false,
}: PublicTableOfContentsProps) {
  const [activeId, setActiveId] = useState<string>('');

  useEffect(() => {
    if (!trackActiveHeading) {
      return;
    }

    if (typeof IntersectionObserver === 'undefined' || toc.length === 0) {
      return;
    }

    const headingElements = toc
      .map(entry => document.getElementById(entry.id))
      .filter((element): element is HTMLElement => element !== null);

    const observer = new IntersectionObserver(
      entries => {
        const visibleEntries = entries.filter(entry => entry.isIntersecting);
        if (visibleEntries.length === 0) {
          return;
        }

        const topmostEntry = visibleEntries.reduce<IntersectionObserverEntry>(
          (a, b) =>
            a.boundingClientRect.top < b.boundingClientRect.top ? a : b,
          visibleEntries[0]
        );

        setActiveId(topmostEntry.target.id);
      },
      { rootMargin: '-80px 0px -70% 0px' }
    );

    for (const headingElement of headingElements) {
      observer.observe(headingElement);
    }

    return () => observer.disconnect();
  }, [toc, trackActiveHeading]);

  const handleJump = useCallback((id: string) => {
    const element = document.getElementById(id);
    if (!element) {
      return;
    }

    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    globalThis.history.replaceState(null, '', `#${id}`);
    setActiveId(id);
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      if (event.key === 'ArrowDown' && index < toc.length - 1) {
        event.preventDefault();
        const nextButton = event.currentTarget
          .nextElementSibling as HTMLButtonElement | null;
        nextButton?.focus();
      }

      if (event.key === 'ArrowUp' && index > 0) {
        event.preventDefault();
        const previousButton = event.currentTarget
          .previousElementSibling as HTMLButtonElement | null;
        previousButton?.focus();
      }
    },
    [toc.length]
  );

  if (toc.length === 0) {
    return null;
  }

  return (
    <nav aria-label={ariaLabel} className={cn(stickyClassName, className)}>
      <p className='public-doc-label mb-3 px-3'>On this page</p>
      <div className='space-y-0.5'>
        {toc.map((entry, index) => {
          const isActive = activeId === entry.id;

          return (
            <button
              key={entry.id}
              type='button'
              onClick={() => handleJump(entry.id)}
              onKeyDown={event => handleKeyDown(event, index)}
              aria-current={isActive ? 'location' : undefined}
              className={cn(
                'public-doc-nav-item',
                isActive && 'public-doc-nav-item-active'
              )}
            >
              {entry.title}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
