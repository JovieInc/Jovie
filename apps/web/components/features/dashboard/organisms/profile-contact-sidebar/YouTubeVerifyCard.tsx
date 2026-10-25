'use client';

// @coverage-via apps/web/tests/unit/dashboard/YouTubeVerifyCard.test.tsx

import { Button } from '@jovie/ui';
import { usePathname, useSearchParams } from 'next/navigation';
import { useYouTubeVerificationQuery } from '@/lib/queries/useYouTubeVerificationQuery';

interface YouTubeVerifyCardProps {
  readonly profileId: string;
}

/**
 * The one moment YouTube asks for anything: the owner is waiting for access
 * and a channel they named is unproven. The ask is framed by that benefit.
 * Anything Jovie can prove itself is linked silently (youtube-silent-link),
 * and an admitted owner never sees this card. Connecting is not Jovie
 * verification, so there is no badge in any state.
 */
export function YouTubeVerifyCard({ profileId }: YouTubeVerifyCardProps) {
  const { data } = useYouTubeVerificationQuery(profileId);
  const pathname = usePathname();
  const mismatch =
    useSearchParams()?.get('youtube_verification') === 'mismatch';

  // Loading, error, no candidate, verified, or already admitted: nothing.
  if (
    !data ||
    data.state !== 'unverified' ||
    !data.channel ||
    !data.needsAccess
  ) {
    return null;
  }

  const connectHref = `/api/connectors/youtube/authorize?${new URLSearchParams({
    creatorProfileId: profileId,
    returnTo: pathname ?? '/',
  }).toString()}`;

  return (
    <div
      className='mt-3 flex items-center gap-2 rounded-md px-2 py-1'
      data-testid='youtube-verify-card'
    >
      <span className='min-w-0 flex-1 truncate text-app font-book text-primary-token'>
        {mismatch
          ? `That Google account doesn't own ${data.channel.title}`
          : data.channel.title}
      </span>
      <Button asChild variant='primary' size='sm'>
        <a href={connectHref}>Connect to get access</a>
      </Button>
    </div>
  );
}
