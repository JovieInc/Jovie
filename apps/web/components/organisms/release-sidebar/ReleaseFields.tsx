'use client';

/**
 * ReleaseFields Component
 *
 * Read-only fields for release title and date display
 */

import { useCallback, useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { TruncatedText } from '@/components/atoms/TruncatedText';
import { DrawerPropertyRow } from '@/components/molecules/drawer';
import { cn } from '@/lib/utils';

import { formatReleaseDate } from './utils';

interface ReleaseFieldsProps {
  readonly title: string;
  readonly releaseDate: string | undefined;
}

export function ReleaseFields({ title, releaseDate }: ReleaseFieldsProps) {
  const [titleCopied, setTitleCopied] = useState(false);

  const handleCopyTitle = useCallback(() => {
    if (!title) return;
    navigator.clipboard.writeText(title);
    setTitleCopied(true);
    setTimeout(() => setTitleCopied(false), 2000);
  }, [title]);

  return (
    <div className='space-y-3'>
      {/* Title field - always read-only, 2 lines max with tooltip */}
      <DrawerPropertyRow
        label='Title'
        value={
          title ? (
            <button
              type='button'
              onClick={handleCopyTitle}
              className='group/copy flex items-start gap-1 w-full text-left'
              title='Copy title'
            >
              <TruncatedText
                lines={2}
                className='font-medium text-primary-token min-h-10'
                tooltipSide='bottom'
              >
                {title}
              </TruncatedText>
              <Icon
                name={titleCopied ? 'Check' : 'Copy'}
                className={cn(
                  'mt-0.5 h-3 w-3 shrink-0 transition-opacity',
                  titleCopied
                    ? 'text-success opacity-100'
                    : 'opacity-0 group-hover/copy:opacity-60'
                )}
              />
            </button>
          ) : (
            <span className='text-secondary-token italic min-h-10'>
              Untitled
            </span>
          )
        }
      />

      {/* Release date field (read-only) */}
      <DrawerPropertyRow
        label='Released'
        value={
          <span className={releaseDate ? '' : 'text-secondary-token italic'}>
            {formatReleaseDate(releaseDate)}
          </span>
        }
      />
    </div>
  );
}
