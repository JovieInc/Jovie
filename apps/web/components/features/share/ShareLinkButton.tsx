'use client';

import { Check, Share2 } from 'lucide-react';
import {
  CircleIconButton,
  type CircleIconButtonVariant,
} from '@/components/atoms/CircleIconButton';
import { type ShareLinkResult, useShareLink } from '@/hooks/useShareLink';

interface ShareLinkButtonProps {
  readonly title: string;
  /** Resolved at click time so SSR and client agree on the shared URL. */
  readonly getUrl: () => string;
  readonly ariaLabel?: string;
  readonly variant?: CircleIconButtonVariant;
  readonly testId?: string;
  readonly onShare?: (result: ShareLinkResult) => void;
}

/**
 * Icon-only share control: 44px target, native share sheet first, clipboard
 * copy fallback, and a check icon plus polite live-region text as the
 * confirmation when the link was copied.
 */
export function ShareLinkButton({
  title,
  getUrl,
  ariaLabel = 'Share',
  variant = 'pearlQuiet',
  testId = 'share-link-button',
  onShare,
}: Readonly<ShareLinkButtonProps>) {
  const { share, copied } = useShareLink();

  return (
    <CircleIconButton
      size='lg'
      variant={variant}
      ariaLabel={copied ? 'Link copied' : ariaLabel}
      data-testid={testId}
      onClick={async () => {
        const result = await share({ title, url: getUrl() });
        onShare?.(result);
      }}
    >
      {copied ? (
        <Check className='h-5 w-5' aria-hidden='true' />
      ) : (
        <Share2 className='h-5 w-5' aria-hidden='true' />
      )}
      <span aria-live='polite' className='sr-only'>
        {copied ? 'Link copied' : ''}
      </span>
    </CircleIconButton>
  );
}
