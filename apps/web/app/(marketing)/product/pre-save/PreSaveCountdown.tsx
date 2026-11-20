'use client';

import { ReleaseCountdown } from '@/components/features/release/ReleaseCountdown';
import { getPreSaveReleaseAt, PRE_SAVE_FIXTURE } from '@/data/preSaveCopy';

/** Client island: the shipped countdown keeps its own clock. */
export function PreSaveCountdown() {
  const releaseDate = new Date(getPreSaveReleaseAt());
  return (
    <div
      data-testid='pre-save-countdown'
      className='flex w-full flex-col gap-6 rounded-2xl bg-surface-1 p-4'
    >
      <p className='text-sm font-medium text-primary-token'>
        {PRE_SAVE_FIXTURE.releaseTitle}
      </p>
      <ReleaseCountdown releaseDate={releaseDate} compact />
    </div>
  );
}
