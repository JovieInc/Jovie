'use client';

/**
 * ReleaseFields Component
 *
 * Read-only field for release date display
 */

import { DrawerPropertyRow } from '@/components/molecules/drawer';

import { formatReleaseDate } from './utils';

interface ReleaseFieldsProps {
  readonly releaseDate: string | undefined;
}

export function ReleaseFields({ releaseDate }: ReleaseFieldsProps) {
  return (
    <div className='space-y-3'>
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
