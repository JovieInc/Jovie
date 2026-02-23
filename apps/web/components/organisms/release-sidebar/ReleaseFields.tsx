'use client';

/**
 * ReleaseFields Component
 *
 * Read-only fields for release title and date display
 */

import { TruncatedText } from '@/components/atoms/TruncatedText';
import { DrawerPropertyRow } from '@/components/molecules/drawer';

import { formatReleaseDate } from './utils';

interface ReleaseFieldsProps {
  readonly title: string;
  readonly releaseDate: string | undefined;
}

export function ReleaseFields({ title, releaseDate }: ReleaseFieldsProps) {
  return (
    <div className='space-y-3'>
      {/* Title field - always read-only, 2 lines max with tooltip */}
      <DrawerPropertyRow
        label='Title'
        value={
          title ? (
            <TruncatedText
              lines={2}
              className='font-medium text-primary-token min-h-10'
              tooltipSide='bottom'
            >
              {title}
            </TruncatedText>
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
