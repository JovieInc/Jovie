'use client';

import { Button } from '@jovie/ui';
import { ArrowRight, CheckCircle2, Clock3, Copy } from 'lucide-react';
import Link from 'next/link';
import { memo, useCallback, useMemo, useState } from 'react';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { APP_ROUTES } from '@/constants/routes';
import { useClipboard } from '@/hooks/useClipboard';
import {
  type BioLinkActivation,
  buildInstagramBioLink,
  INSTAGRAM_EDIT_PROFILE_URL,
  postDistributionEvent,
} from '@/lib/distribution/instagram-activation';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { cn } from '@/lib/utils';

interface SocialBioNudgeProps {
  readonly bioLinkActivation?: BioLinkActivation | null;
  readonly profileId: string;
  readonly profileUrl: string;
}

interface MilestoneRowProps {
  readonly description: string;
  readonly isComplete: boolean;
  readonly label: string;
}

function formatDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
}

function MilestoneRow({
  description,
  isComplete,
  label,
}: Readonly<MilestoneRowProps>) {
  return (
    <li className='flex items-start gap-3'>
      <span
        className={cn(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
          isComplete
            ? 'border-success/25 bg-success/10 text-success'
            : 'border-(--linear-app-frame-seam) bg-surface-0 text-tertiary-token'
        )}
      >
        {isComplete ? (
          <CheckCircle2 className='h-3.5 w-3.5' aria-hidden='true' />
        ) : (
          <Clock3 className='h-3.5 w-3.5' aria-hidden='true' />
        )}
      </span>
      <div className='min-w-0'>
        <p className='text-app font-semibold text-primary-token'>{label}</p>
        <p className='text-[12.5px] leading-5 text-secondary-token'>
          {description}
        </p>
      </div>
    </li>
  );
}

function getBioLinkDescription(
  status: BioLinkActivation['status'],
  windowEndLabel: string | null
): string {
  if (status !== 'expired') {
    return 'Copy your tagged Jovie link, open Instagram, and paste it into your bio. We will mark activation on the first Instagram-sourced visit.';
  }

  const suffix = windowEndLabel ? ` by ${windowEndLabel}` : '';
  return `No Instagram visitor landed in the first seven days${suffix}. Copy the tagged link again and paste it into your bio.`;
}

function getCopyButtonLabel(
  isSuccess: boolean,
  isError: boolean
): 'Copied' | 'Retry Copy' | 'Copy Instagram Bio Link' {
  if (isSuccess) {
    return 'Copied';
  }

  if (isError) {
    return 'Retry Copy';
  }

  return 'Copy Instagram Bio Link';
}

export const SocialBioNudge = memo(function SocialBioNudge({
  bioLinkActivation,
  profileId,
  profileUrl,
}: SocialBioNudgeProps): React.ReactElement | null {
  const notifications = useNotifications();
  const instagramBioUrl = useMemo(
    () => buildInstagramBioLink(profileUrl),
    [profileUrl]
  );
  const resolvedBioLinkActivation =
    bioLinkActivation ??
    ({
      activatedAt: null,
      copiedAt: null,
      openedAt: null,
      platform: 'instagram',
      status: 'pending',
      windowEndsAt: null,
    } satisfies BioLinkActivation);
  const [didCopyLink, setDidCopyLink] = useState(
    Boolean(resolvedBioLinkActivation.copiedAt)
  );
  const [didOpenInstagram, setDidOpenInstagram] = useState(
    Boolean(resolvedBioLinkActivation.openedAt)
  );

  const { copy, isError, isSuccess } = useClipboard({
    onError: () => {
      notifications.error('Failed to copy link');
    },
    onSuccess: () => {
      setDidCopyLink(true);
      notifications.success('Instagram bio link copied', { duration: 2000 });
      void postDistributionEvent({
        eventType: 'link_copied',
        metadata: { surface: 'dashboard' },
        platform: 'instagram',
        profileId,
      });
    },
  });

  const handleOpenInstagram = useCallback(() => {
    setDidOpenInstagram(true);
    void postDistributionEvent({
      eventType: 'platform_opened',
      metadata: { surface: 'dashboard' },
      platform: 'instagram',
      profileId,
    });

    globalThis.open(
      INSTAGRAM_EDIT_PROFILE_URL,
      '_blank',
      'noopener,noreferrer'
    );
  }, [profileId]);

  const handleCopyLink = useCallback(() => {
    void copy(instagramBioUrl);
  }, [copy, instagramBioUrl]);

  const hasCopiedLink =
    didCopyLink || Boolean(resolvedBioLinkActivation.copiedAt);
  const hasOpenedLink =
    didOpenInstagram || Boolean(resolvedBioLinkActivation.openedAt);
  const activatedAtLabel = formatDate(resolvedBioLinkActivation.activatedAt);
  const windowEndLabel = formatDate(resolvedBioLinkActivation.windowEndsAt);
  const copyButtonLabel = getCopyButtonLabel(isSuccess, isError);

  if (resolvedBioLinkActivation.status === 'activated') {
    return (
      <div className='rounded-xl border border-success/20 bg-success/5 p-4'>
        <div className='flex items-start gap-3'>
          <div className='rounded-full border border-success/20 bg-success/10 p-2 text-success'>
            <CheckCircle2 className='h-4 w-4' aria-hidden='true' />
          </div>
          <div className='min-w-0 flex-1 space-y-1.5'>
            <div className='space-y-0.5'>
              <p className='text-sm font-[590] text-primary-token'>
                Instagram activated
              </p>
              <p className='text-app leading-5 text-secondary-token'>
                Your first Instagram visitor landed on Jovie
                {activatedAtLabel ? ` on ${activatedAtLabel}.` : '.'}
              </p>
            </div>
            <div className='flex flex-wrap gap-2'>
              <Button asChild size='sm' variant='secondary'>
                <Link href={APP_ROUTES.DASHBOARD_AUDIENCE}>
                  View Analytics
                  <ArrowRight className='ml-1 h-3.5 w-3.5' />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const title =
    resolvedBioLinkActivation.status === 'expired'
      ? 'Try Instagram again'
      : 'Activate your Instagram bio link';
  const description = getBioLinkDescription(
    resolvedBioLinkActivation.status,
    windowEndLabel
  );

  return (
    <div className='rounded-xl border border-(--linear-app-frame-seam) bg-surface-1 p-4'>
      <div className='flex items-start gap-3'>
        <div
          className='rounded-full border border-(--linear-app-frame-seam) bg-surface-0 p-2 text-secondary-token'
          aria-hidden='true'
        >
          <SocialIcon platform='instagram' className='h-4 w-4' />
        </div>
        <div className='min-w-0 flex-1 space-y-3'>
          <div className='space-y-1'>
            <p className='text-sm font-[590] text-primary-token'>{title}</p>
            <p className='text-app leading-5 text-secondary-token'>
              {description}
            </p>
            <p className='text-[12.5px] font-semibold text-primary-token'>
              {profileUrl}
            </p>
          </div>

          <ul className='space-y-2'>
            <MilestoneRow
              description='Use the tagged version so Instagram traffic stays attributable.'
              isComplete={hasCopiedLink}
              label='Copy your Instagram bio link'
            />
            <MilestoneRow
              description='Open your Instagram profile settings and update the website field.'
              isComplete={hasOpenedLink}
              label='Open Instagram'
            />
            <MilestoneRow
              description={
                resolvedBioLinkActivation.status === 'expired'
                  ? 'The activation window expired before the first Instagram visit arrived.'
                  : 'Activation happens after the first Instagram-sourced visit lands on your profile.'
              }
              isComplete={false}
              label='Waiting for first Instagram visit'
            />
          </ul>

          <div className='flex flex-wrap gap-2'>
            <Button onClick={handleCopyLink} size='sm'>
              <Copy className='mr-1.5 h-3.5 w-3.5' aria-hidden='true' />
              {copyButtonLabel}
            </Button>
            <Button onClick={handleOpenInstagram} size='sm' variant='secondary'>
              Open Instagram
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
});
