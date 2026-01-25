'use client';

/**
 * ReleaseFields Component
 *
 * Read-only fields for release title and date display
 */

import { Label } from '@jovie/ui';
import { TruncatedText } from '@/components/atoms/TruncatedText';
import { CopyLinkInput } from '@/components/dashboard/atoms/CopyLinkInput';
import { DrawerPropertyRow } from '@/components/molecules/drawer';
import { getBaseUrl } from '@/lib/utils/platform-detection';

import { formatReleaseDate } from './utils';

interface ReleaseFieldsProps {
  title: string;
  releaseDate: string | undefined;
  smartLinkPath: string;
}

export function ReleaseFields({
  title,
  releaseDate,
  smartLinkPath,
}: ReleaseFieldsProps) {
  const smartLinkUrl = `${getBaseUrl()}${smartLinkPath}`;

  return (
    <div className='space-y-3'>
      {/* Title field - always read-only, 2 lines max with tooltip */}
      <DrawerPropertyRow
        label='Title'
        value={
          title ? (
            <TruncatedText
              lines={2}
              className='font-medium min-h-10'
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

      {/* Smart link field with copy functionality */}
      <div className='grid grid-cols-[96px,minmax(0,1fr)] items-center gap-2'>
        <Label className='text-xs text-secondary-token'>Smart link</Label>
        <CopyLinkInput url={smartLinkUrl} size='sm' />
      </div>
    </div>
  );
}
