'use client';

/**
 * ReleaseFields Component
 *
 * Editable/readonly fields for release title and date
 */

import { Label } from '@jovie/ui';
import { CopyLinkInput } from '@/components/dashboard/atoms/CopyLinkInput';
import { DrawerPropertyRow } from '@/components/molecules/drawer';
import { getBaseUrl } from '@/lib/utils/platform-detection';

import { formatReleaseDate } from './utils';

interface ReleaseFieldsProps {
  title: string;
  releaseDate: string | undefined;
  smartLinkPath: string;
  isEditable: boolean;
  onTitleChange: (value: string) => void;
}

export function ReleaseFields({
  title,
  releaseDate,
  smartLinkPath,
  isEditable: _isEditable,
  onTitleChange: _onTitleChange,
}: ReleaseFieldsProps) {
  const smartLinkUrl = `${getBaseUrl()}${smartLinkPath}`;

  return (
    <div className='space-y-3'>
      {/* Title field - always read-only */}
      <DrawerPropertyRow
        label='Title'
        value={
          title ? (
            <span className='font-medium'>{title}</span>
          ) : (
            <span className='text-secondary-token italic'>Untitled</span>
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
