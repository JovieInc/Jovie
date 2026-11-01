'use client';

import { Button } from '@jovie/ui';
import { Download } from 'lucide-react';
import Link from 'next/link';
import {
  ARTIST_VISIBILITY_FAN_LIST_UNLOCK,
  ARTIST_VISIBILITY_SHARE_PROMPT,
} from '@/app/billing/success/checkout-success-state';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { CopyableUrlRow } from '@/components/molecules/CopyableUrlRow';

interface CheckoutUnlockCardsProps {
  /** Live, claimed page URL. Null while the page is private or unclaimed. */
  readonly shareUrl: string | null;
  /** The fan-list export card needs a claimed profile. */
  readonly showFanListExport: boolean;
  readonly canNativeShare: boolean;
  readonly onNativeShare: (url: string) => void;
}

/** Post-checkout: fill the fan list first, then what the plan secures. */
export function CheckoutUnlockCards({
  shareUrl,
  showFanListExport,
  canNativeShare,
  onNativeShare,
}: CheckoutUnlockCardsProps) {
  return (
    <>
      {shareUrl ? (
        <ContentSurfaceCard surface='nested' data-testid='paid-share-prompt'>
          <div className='space-y-3 p-4 text-left'>
            <p className='text-app font-semibold text-primary-token'>
              {ARTIST_VISIBILITY_SHARE_PROMPT.title}
            </p>
            <CopyableUrlRow
              url={shareUrl}
              displayValue={shareUrl.replace(/^https?:\/\//u, '')}
              testId='paid-share-link'
            />
            {canNativeShare ? (
              <Button
                type='button'
                size='sm'
                onClick={() => onNativeShare(shareUrl)}
              >
                {ARTIST_VISIBILITY_SHARE_PROMPT.shareLabel}
              </Button>
            ) : null}
          </div>
        </ContentSurfaceCard>
      ) : null}
      {showFanListExport ? (
        <ContentSurfaceCard surface='nested' data-testid='paid-unlock-fan-list'>
          <div className='space-y-3 p-4 text-left'>
            <Download className='h-5 w-5 text-accent' aria-hidden='true' />
            <p className='text-2xs font-medium text-secondary-token'>
              {ARTIST_VISIBILITY_FAN_LIST_UNLOCK.header}
            </p>
            <p className='text-app font-semibold text-primary-token'>
              {ARTIST_VISIBILITY_FAN_LIST_UNLOCK.title}
            </p>
            <p className='text-xs leading-5 text-tertiary-token'>
              {ARTIST_VISIBILITY_FAN_LIST_UNLOCK.description}
            </p>
            <Button asChild variant='secondary' size='sm'>
              <Link href={ARTIST_VISIBILITY_FAN_LIST_UNLOCK.href}>
                {ARTIST_VISIBILITY_FAN_LIST_UNLOCK.cta}
              </Link>
            </Button>
          </div>
        </ContentSurfaceCard>
      ) : null}
    </>
  );
}
