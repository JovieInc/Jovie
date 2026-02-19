'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface DeferredSectionProps {
  readonly children: React.ReactNode;
  readonly placeholderHeight?: number | string;
  readonly placeholderWidth?: number | string;
  readonly rootMargin?: string;
  readonly className?: string;
  readonly placeholderClassName?: string;
  readonly testId?: string;
}

export function DeferredSection({
  children,
  placeholderHeight = 480,
  placeholderWidth = '100%',
  rootMargin = '200px 0px',
  className,
  placeholderClassName,
  testId = 'deferred-section',
}: DeferredSectionProps) {
  const [shouldRender, setShouldRender] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!wrapperRef.current || shouldRender) {
      return;
    }

    if (typeof IntersectionObserver === 'undefined') {
      setShouldRender(true);
      return;
    }

    const observer = new IntersectionObserver(
      entries => {
        const [entry] = entries;
        if (entry?.isIntersecting) {
          setShouldRender(true);
          observer.disconnect();
        }
      },
      { rootMargin, threshold: 0.1 }
    );

    observer.observe(wrapperRef.current);

    return () => observer.disconnect();
  }, [rootMargin, shouldRender]);

  return (
    <div
      ref={wrapperRef}
      data-testid={testId}
      className={cn('relative w-full', className)}
      aria-busy={!shouldRender}
    >
      {shouldRender ? (
        children
      ) : (
        <div
          aria-hidden='true'
          className={cn('w-full', placeholderClassName)}
          style={{
            minHeight: placeholderHeight,
            minWidth: placeholderWidth,
            backgroundColor: 'var(--linear-bg-surface-0)',
            opacity: 0.4,
            borderRadius: 'var(--linear-radius-lg)',
          }}
        />
      )}
    </div>
  );
}
