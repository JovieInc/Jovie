'use client';

import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import type { TocEntry } from '@/types/docs';

export interface BlogTableOfContentsProps {
  readonly toc: TocEntry[];
}

export function BlogTableOfContents({ toc }: BlogTableOfContentsProps) {
  const [activeId, setActiveId] = useState<string>('');

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined' || toc.length === 0) return;

    const headingElements = toc
      .map(entry => document.getElementById(entry.id))
      .filter((el): el is HTMLElement => el !== null);

    const observer = new IntersectionObserver(
      entries => {
        const visibleEntries = entries.filter(e => e.isIntersecting);
        if (visibleEntries.length > 0) {
          const topmost = visibleEntries.reduce<IntersectionObserverEntry>(
            (a, b) =>
              a.boundingClientRect.top < b.boundingClientRect.top ? a : b,
            visibleEntries[0]
          );
          setActiveId(topmost.target.id);
        }
      },
      { rootMargin: '-80px 0px -70% 0px' }
    );

    for (const el of headingElements) {
      observer.observe(el);
    }

    return () => observer.disconnect();
  }, [toc]);

  const handleJump = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    globalThis.history.replaceState(null, '', `#${id}`);
    setActiveId(id);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      if (e.key === 'ArrowDown' && index < toc.length - 1) {
        e.preventDefault();
        const nextButton = e.currentTarget.nextElementSibling as HTMLElement;
        nextButton?.focus();
      } else if (e.key === 'ArrowUp' && index > 0) {
        e.preventDefault();
        const prevButton = e.currentTarget
          .previousElementSibling as HTMLElement;
        prevButton?.focus();
      }
    },
    [toc.length]
  );

  if (toc.length === 0) return null;

  return (
    <nav
      aria-label='Table of contents'
      className='max-lg:hidden lg:sticky lg:top-24 lg:self-start'
    >
      <p className='text-xs font-medium text-tertiary-token mb-3 uppercase tracking-wider'>
        On this page
      </p>
      <div className='space-y-0.5'>
        {toc.map((entry, index) => (
          <button
            key={entry.id}
            type='button'
            onClick={() => handleJump(entry.id)}
            onKeyDown={e => handleKeyDown(e, index)}
            aria-current={activeId === entry.id ? 'location' : undefined}
            className={cn(
              'block w-full text-left px-3 py-1.5 text-sm rounded-md transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-token focus-visible:ring-offset-1',
              activeId === entry.id
                ? 'text-primary-token font-medium bg-surface-1'
                : 'text-tertiary-token hover:text-primary-token hover:bg-surface-1'
            )}
          >
            {entry.title}
          </button>
        ))}
      </div>
    </nav>
  );
}
