'use client';

// @coverage-via apps/web/tests/unit/dashboard/YouTubeVerifyCard.test.tsx

import { Button } from '@jovie/ui';
import { Check, ExternalLink } from 'lucide-react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useYouTubeVerificationQuery } from '@/lib/queries/useYouTubeVerificationQuery';

interface YouTubeVerifyCardProps {
  readonly profileId: string;
}

/**
 * Setup-rail card for the YouTube channel found during onboarding.
 *
 * `unverified`: the channel is shown as unverified with a one-tap OAuth
 * connect. It claims nothing publicly and unlocks nothing; ownership is only
 * confirmed server-side after Google returns the channel id.
 * `verified`: quiet confirmation. Provider connection is not Jovie
 * verification, so this deliberately does not use the Jovie VerifiedBadge.
 */
export function YouTubeVerifyCard({ profileId }: YouTubeVerifyCardProps) {
  const { data } = useYouTubeVerificationQuery(profileId);
  const pathname = usePathname();
  const mismatch =
    useSearchParams()?.get('youtube_verification') === 'mismatch';

  // Loading, error, and "no candidate" all render nothing (fail closed).
  if (!data || data.state === 'none' || !data.channel) return null;

  const connectHref = `/api/connectors/youtube/authorize?${new URLSearchParams({
    creatorProfileId: profileId,
    returnTo: pathname ?? '/',
  }).toString()}`;

  return (
    <div
      className='mt-3 space-y-1.5'
      data-testid='youtube-verify-card'
      data-state={data.state}
    >
      <div className='flex items-center gap-2 px-2'>
        <span className='text-2xs font-book text-tertiary-token'>YouTube</span>
        <span
          className='rounded-full bg-surface-1 px-1.5 text-3xs font-caption text-tertiary-token'
          data-testid='youtube-verify-status'
        >
          {data.state === 'verified' ? 'Verified' : 'Unverified'}
        </span>
      </div>
      <div className='flex items-center gap-2 rounded-md px-2 py-1'>
        <a
          href={data.channel.url}
          target='_blank'
          rel='noopener noreferrer'
          className='flex min-w-0 flex-1 items-center gap-1.5 text-app font-book text-primary-token hover:underline'
        >
          <span className='truncate'>{data.channel.title}</span>
          <ExternalLink
            className='h-3 w-3 shrink-0 text-tertiary-token'
            aria-hidden='true'
          />
        </a>
        {data.state === 'verified' ? (
          <Check className='h-3.5 w-3.5 text-success' aria-hidden='true' />
        ) : (
          <Button asChild variant='primary' size='sm'>
            <a href={connectHref}>Connect YouTube to verify</a>
          </Button>
        )}
      </div>
      {data.state === 'unverified' && mismatch ? (
        <p
          className='px-2 text-xs text-tertiary-token'
          data-testid='youtube-verify-mismatch'
        >
          That Google account owns a different channel.
        </p>
      ) : null}
    </div>
  );
}
