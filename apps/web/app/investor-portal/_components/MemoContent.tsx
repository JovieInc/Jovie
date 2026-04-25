'use client';

import DOMPurify from 'isomorphic-dompurify';
import { useCallback, useMemo, useState } from 'react';
import { InvestorThemeToggle } from './InvestorThemeToggle';

interface TocEntry {
  readonly id: string;
  readonly title: string;
}

interface MemoContentProps {
  readonly title: string;
  readonly readingTime: number;
  readonly html: string;
  readonly toc: TocEntry[];
}

/**
 * Client wrapper for memo page content.
 * Handles theme toggle state — switches prose area between light/dark.
 */
export function MemoContent({
  title,
  readingTime,
  html,
  toc,
}: MemoContentProps) {
  const [isLight, setIsLight] = useState(false);
  const sanitizedHtml = useMemo(() => DOMPurify.sanitize(html), [html]);

  const handleToggle = useCallback((light: boolean) => {
    setIsLight(light);
  }, []);

  return (
    <div className='px-4 pt-8 sm:px-6 lg:pt-12'>
      <div className='mx-auto max-w-5xl'>
        {/* Header */}
        <div className='mb-8 flex items-start justify-between'>
          <div>
            <h1
              className='text-[length:var(--text-3xl)] font-bold text-[var(--color-text-primary-token)]'
              style={{
                letterSpacing: 'var(--tracking-tight)',
                fontFeatureSettings: 'var(--font-features)',
              }}
            >
              {title}
            </h1>
            <p className='mt-1 text-[length:var(--text-sm)] text-[var(--color-text-quaternary-token)]'>
              {readingTime} min read
            </p>
          </div>

          <InvestorThemeToggle onToggle={handleToggle} />
        </div>

        {/* Content area with optional TOC sidebar */}
        <div className='flex gap-10'>
          {/* Main prose — light mode applies white bg + dark text */}
          <article
            className={`investor-prose min-w-0 flex-1 rounded-[var(--radius-xl)] transition-colors duration-200 ${
              isLight ? 'bg-[#fafaf9] p-6' : ''
            }`}
            style={{
              fontSize: '15px',
              lineHeight: '1.75',
              color: isLight ? '#1a1a1a' : 'var(--color-text-secondary-token)',
              fontFeatureSettings: 'var(--font-features)',
            }}
            // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized with DOMPurify
            dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
          />

          {/* TOC sidebar — desktop only */}
          {toc.length > 2 && (
            <nav
              className='max-lg:hidden w-48 flex-shrink-0'
              aria-label='Table of contents'
            >
              <div className='sticky top-8'>
                <p className='mb-3 text-[length:var(--text-xs)] font-semibold uppercase tracking-widest text-[var(--color-text-quaternary-token)]'>
                  On this page
                </p>
                <ul className='flex flex-col gap-1.5'>
                  {toc.map(entry => (
                    <li key={entry.id}>
                      <a
                        href={`#${entry.id}`}
                        className='block text-[length:var(--text-xs)] leading-snug text-[var(--color-text-tertiary-token)] transition-colors hover:text-[var(--color-text-secondary-token)]'
                      >
                        {entry.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
