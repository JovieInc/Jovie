'use client';

import { Share2, X } from 'lucide-react';
import { memo, useCallback, useEffect, useState } from 'react';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { captureWarning } from '@/lib/error-tracking';

const STORAGE_KEY_PREFIX = 'jovie_social_bio_nudge_dismissed';

interface SocialBioNudgeProps {
  readonly profileId: string;
  readonly profileUrl: string;
}

export const SocialBioNudge = memo(function SocialBioNudge({
  profileId,
  profileUrl,
}: SocialBioNudgeProps): React.ReactElement | null {
  const [dismissed, setDismissed] = useState(false);

  const storageKey = `${STORAGE_KEY_PREFIX}:${profileId}`;

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored === '1') {
        setDismissed(true);
      }
    } catch {
      captureWarning('[SocialBioNudge] Failed to read localStorage');
    }
  }, [storageKey]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem(storageKey, '1');
    } catch {
      captureWarning('[SocialBioNudge] Failed to set localStorage');
    }
  }, [storageKey]);

  if (dismissed) {
    return null;
  }

  return (
    <DashboardCard
      variant='analytics'
      hover={false}
      padding='compact'
      className='flex items-start gap-3'
    >
      <div
        className='shrink-0 rounded-full border border-subtle bg-surface-2/50 p-2 ring-1 ring-inset ring-white/3 dark:ring-white/5'
        aria-hidden='true'
      >
        <Share2 className='h-5 w-5 text-accent-token' />
      </div>
      <div className='min-w-0 flex-1 space-y-2'>
        <div className='space-y-1'>
          <p className='text-[11px] font-[510] uppercase tracking-[0.08em] text-tertiary-token'>
            Grow your audience
          </p>
          <p className='text-[14px] font-[590] leading-5 text-primary-token'>
            Share your Jovie link
          </p>
          <p className='text-[14px] leading-5 text-secondary-token'>
            Add{' '}
            <span className='font-[510] text-primary-token'>{profileUrl}</span>{' '}
            to your Instagram, TikTok, or Twitter bio to start capturing fans
            every time someone visits.
          </p>
        </div>
        <div className='flex flex-wrap items-center gap-x-4 gap-y-1.5'>
          <a
            href='https://www.instagram.com/accounts/edit/'
            target='_blank'
            rel='noopener noreferrer'
            className='flex items-center gap-1.5 text-[13px] text-secondary-token transition-colors hover:text-primary-token'
          >
            <SocialIcon
              platform='instagram'
              className='h-3.5 w-3.5'
              aria-hidden={true}
            />
            Instagram bio
          </a>
          <a
            href='https://www.tiktok.com/setting/'
            target='_blank'
            rel='noopener noreferrer'
            className='flex items-center gap-1.5 text-[13px] text-secondary-token transition-colors hover:text-primary-token'
          >
            <SocialIcon
              platform='tiktok'
              className='h-3.5 w-3.5'
              aria-hidden={true}
            />
            TikTok bio
          </a>
          <a
            href='https://x.com/settings/profile'
            target='_blank'
            rel='noopener noreferrer'
            className='flex items-center gap-1.5 text-[13px] text-secondary-token transition-colors hover:text-primary-token'
          >
            <SocialIcon
              platform='x'
              className='h-3.5 w-3.5'
              aria-hidden={true}
            />
            X / Twitter bio
          </a>
        </div>
      </div>
      <button
        type='button'
        onClick={handleDismiss}
        aria-label='Dismiss nudge'
        className='shrink-0 rounded-full border border-subtle bg-transparent p-1.5 text-tertiary-token transition-colors hover:bg-surface-2/40 hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base'
      >
        <X className='h-4 w-4' aria-hidden='true' />
      </button>
    </DashboardCard>
  );
});
