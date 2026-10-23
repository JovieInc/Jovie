'use client';

import { ReleaseCountdown } from '@/components/features/release/ReleaseCountdown';
import { PRE_SAVE_FIXTURE } from '@/data/preSaveCopy';

const RELEASE_DATE = new Date(PRE_SAVE_FIXTURE.releaseAt);

/** Client island: the shipped countdown keeps its own clock. */
export function PreSaveCountdown() {
  return (
    <div
      data-testid='pre-save-countdown'
      className='flex w-full flex-col gap-6'
    >
      <p className='text-sm font-medium text-primary-token'>
        {PRE_SAVE_FIXTURE.releaseTitle}
      </p>
      <ReleaseCountdown releaseDate={RELEASE_DATE} compact />
    </div>
  );
}
