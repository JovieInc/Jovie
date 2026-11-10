'use client';

import { useState } from 'react';
import { DrawerEditableTextField } from '@/components/molecules/drawer/DrawerEditableTextField';
import { ISRC_FIXTURE } from '@/data/isrcCopy';
import {
  compactEditableIsrc,
  normalizeEditableIsrc,
} from '@/lib/discography/editable-isrc';

function compactFieldValue(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? compactEditableIsrc(trimmed) : null;
}

/** Client island: the field keeps its own draft and save state. */
export function IsrcEditor() {
  const [isrc, setIsrc] = useState<string | null>(ISRC_FIXTURE.primaryIsrc);

  return (
    <div data-testid='isrc-editor' className='flex w-full flex-col gap-6'>
      <div className='flex flex-col gap-2'>
        <p className='text-sm font-medium text-primary-token'>
          {ISRC_FIXTURE.releaseTitle}
        </p>
        <div className='flex items-center justify-between gap-6'>
          <span className='text-xs text-secondary-token'>Primary</span>
          <div className='min-w-0 flex-1'>
            <DrawerEditableTextField
              label='ISRC'
              value={isrc}
              editable
              monospace
              density='inline'
              normalizeValue={compactFieldValue}
              onSave={nextValue => {
                setIsrc(normalizeEditableIsrc(nextValue));
              }}
              copyValue={isrc}
            />
          </div>
        </div>
      </div>
      <div className='flex flex-col gap-3'>
        {ISRC_FIXTURE.tracks.map(track => (
          <div
            key={track.isrc}
            className='flex items-center justify-between gap-6'
          >
            <span className='text-sm text-secondary-token'>{track.title}</span>
            <DrawerEditableTextField
              label={track.title}
              value={track.isrc}
              monospace
              density='inline'
              copyValue={track.isrc}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
