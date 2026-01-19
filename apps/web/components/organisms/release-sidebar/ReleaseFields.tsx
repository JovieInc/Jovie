'use client';

/**
 * ReleaseFields Component
 *
 * Editable/readonly fields for release title and date
 */

import { Input, Label } from '@jovie/ui';

import { CopyLinkInput } from '@/components/dashboard/atoms/CopyLinkInput';
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
  isEditable,
  onTitleChange,
}: ReleaseFieldsProps) {
  const smartLinkUrl = `${getBaseUrl()}${smartLinkPath}`;

  return (
    <div className='space-y-3'>
      {/* Title field */}
      <div className='grid grid-cols-[96px,minmax(0,1fr)] items-center gap-2'>
        <Label className='text-xs text-sidebar-muted'>Title</Label>
        {isEditable ? (
          <Input
            value={title}
            onChange={event => onTitleChange(event.target.value)}
            placeholder='Release title'
          />
        ) : (
          <div className='min-h-9 flex items-center text-sm'>
            {title ? (
              <span className='font-medium'>{title}</span>
            ) : (
              <span className='text-sidebar-muted italic'>Untitled</span>
            )}
          </div>
        )}
      </div>

      {/* Release date field (read-only) */}
      <div className='grid grid-cols-[96px,minmax(0,1fr)] items-center gap-2'>
        <Label className='text-xs text-sidebar-muted'>Released</Label>
        <div className='min-h-9 flex items-center text-sm'>
          <span className={releaseDate ? '' : 'text-sidebar-muted italic'}>
            {formatReleaseDate(releaseDate)}
          </span>
        </div>
      </div>

      {/* Smart link field with copy functionality */}
      <div className='grid grid-cols-[96px,minmax(0,1fr)] items-center gap-2'>
        <Label className='text-xs text-sidebar-muted'>Smart link</Label>
        <CopyLinkInput url={smartLinkUrl} size='sm' />
      </div>
    </div>
  );
}
