import { Skeleton } from '@jovie/ui';
import { CheckCircle2, Mail } from 'lucide-react';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import type { NotificationSubscriptionState } from '@/types/notifications';

/** Prevents synthetic font weight rendering for better typography */
export const noFontSynthesisStyle: CSSProperties = {
  fontSynthesisWeight: 'none',
};

/**
 * Loading skeleton - shown during hydration while checking subscription status
 */
export function SubscriptionFormSkeleton() {
  return (
    <output className='block space-y-3' aria-busy='true'>
      <span className='sr-only'>Loading subscription form</span>
      {/* Input area skeleton */}
      <Skeleton className='h-12 w-full rounded-2xl' />
      {/* Button skeleton */}
      <Skeleton className='h-11 w-full rounded-md' />
      {/* Disclaimer area skeleton - fixed height to prevent layout shift */}
      <div className='h-4' />
    </output>
  );
}

function getChannelLabel(
  subscribedChannels?: NotificationSubscriptionState
): string {
  const hasEmail = Boolean(subscribedChannels?.email);
  const hasSms = Boolean(subscribedChannels?.sms);

  if (hasEmail && hasSms) return 'Email & SMS notifications on';
  if (hasEmail) return 'Email notifications on';
  if (hasSms) return 'SMS notifications on';
  return 'Notifications on';
}

/**
 * Success state - shown when user has subscribed.
 * Displays channel-specific status badge + Listen Now CTA.
 */
export function SubscriptionSuccess({
  artistName,
  handle,
  subscribedChannels,
}: Readonly<{
  artistName: string;
  handle?: string;
  subscribedChannels?: NotificationSubscriptionState;
}>) {
  const channelLabel = getChannelLabel(subscribedChannels);

  return (
    <div className='space-y-3'>
      <p className='flex items-center justify-center gap-1.5 text-sm text-secondary-token'>
        <CheckCircle2
          className='h-4 w-4 shrink-0 text-green-600 dark:text-green-400'
          aria-hidden='true'
        />
        <span>{channelLabel}</span>
      </p>
      {handle ? (
        <Link
          href={`/${handle}?mode=listen`}
          prefetch
          className='inline-flex items-center justify-center w-full px-8 py-4 text-lg font-semibold rounded-xl bg-btn-primary text-btn-primary-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:opacity-95 focus-ring-transparent-offset'
        >
          Listen Now
        </Link>
      ) : null}
    </div>
  );
}

/**
 * Pending confirmation state - shown when double opt-in email was sent
 */
export function SubscriptionPendingConfirmation() {
  return (
    <div className='space-y-1'>
      <div className='inline-flex items-center justify-center w-full px-8 py-4 rounded-xl bg-surface-2 text-primary-token shadow-sm transition-colors duration-200'>
        <Mail className='w-5 h-5 mr-2 text-accent-bright' aria-hidden='true' />
        <span className='font-semibold'>Check your email</span>
      </div>
      <p className='text-xs text-center text-secondary-token'>
        We sent a confirmation link to your email. Click it to turn on
        notifications from this artist.
      </p>
    </div>
  );
}
