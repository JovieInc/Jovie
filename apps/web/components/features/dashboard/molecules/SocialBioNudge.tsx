'use client';

import { Share2, X } from 'lucide-react';
import { memo, useCallback, useEffect, useState } from 'react';
import { AppIconButton } from '@/components/atoms/AppIconButton';
import { SocialIcon } from '@/components/atoms/SocialIcon';
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
    <div className='flex items-start gap-2 rounded-md border border-subtle px-2 py-1.5'>
      <div
        className='shrink-0 rounded-md bg-surface-0 p-1.5'
        aria-hidden='true'
      >
        <Share2 className='h-3.5 w-3.5 text-secondary-token' />
      </div>
      <div className='min-w-0 flex-1 space-y-1'>
        <div className='space-y-0.5'>
          <p className='text-[13px] font-[560] tracking-normal text-secondary-token'>
            Grow your audience
          </p>
          <p className='text-[14px] font-[590] leading-5 text-primary-token'>
            Share your Jovie link
          </p>
          <p className='text-[13px] leading-5 text-secondary-token'>
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
            className='inline-flex items-center gap-1.5 text-[12.5px] text-secondary-token transition-colors hover:text-primary-token'
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
            className='inline-flex items-center gap-1.5 text-[12.5px] text-secondary-token transition-colors hover:text-primary-token'
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
            className='inline-flex items-center gap-1.5 text-[12.5px] text-secondary-token transition-colors hover:text-primary-token'
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
      <AppIconButton
        onClick={handleDismiss}
        ariaLabel='Dismiss nudge'
        className='self-start border-transparent bg-transparent text-tertiary-token hover:border-subtle hover:bg-surface-0 hover:text-primary-token'
      >
        <X className='h-4 w-4' aria-hidden='true' />
      </AppIconButton>
    </div>
  );
});
