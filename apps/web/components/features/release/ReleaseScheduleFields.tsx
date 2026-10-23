'use client';

import { useState } from 'react';
import { DatePicker } from '@/components/molecules/DatePicker';
import { RELEASE_SCHEDULING_COPY } from '@/data/releaseSchedulingCopy';

/** Live release date and reveal date fields from the release form. */
export function ReleaseScheduleFields() {
  const { fields, fixture } = RELEASE_SCHEDULING_COPY;
  const [releaseDate, setReleaseDate] = useState<string>(fixture.releaseDate);
  const [revealDate, setRevealDate] = useState<string>(fixture.revealDate);

  return (
    <div data-testid='release-schedule-fields' className='flex flex-col gap-4'>
      <div className='flex flex-col gap-1.5'>
        <label
          htmlFor='release-date'
          className='text-2xs font-medium tracking-tight text-secondary-token'
        >
          {fields.releaseDate}
        </label>
        <DatePicker
          id='release-date'
          value={releaseDate}
          onChange={setReleaseDate}
        />
      </div>
      <div className='flex flex-col gap-1.5'>
        <label
          htmlFor='reveal-date'
          className='text-2xs font-medium tracking-tight text-secondary-token'
        >
          {fields.revealDate}
        </label>
        <DatePicker
          id='reveal-date'
          value={revealDate}
          onChange={setRevealDate}
        />
        <p className='text-2xs text-tertiary-token'>{fields.revealHelp}</p>
      </div>
    </div>
  );
}
