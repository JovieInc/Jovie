import { Skeleton } from '@jovie/ui';
import { Bell, Mail } from 'lucide-react';
import type { CSSProperties } from 'react';

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

/**
 * Success state - shown when user has subscribed
 */
export function SubscriptionSuccess({
  artistName,
}: Readonly<{ artistName: string }>) {
  return (
    <div className='space-y-1'>
      <div className='inline-flex items-center justify-center w-full px-8 py-4 rounded-xl bg-btn-primary text-btn-primary-foreground shadow-lg transition-colors duration-200'>
        <Bell className='w-5 h-5 mr-2 text-accent-bright' aria-hidden='true' />
        <span className='font-semibold'>You&apos;re in</span>
      </div>
      <p className='text-xs text-center text-secondary-token'>
        You&apos;ll get a heads-up when {artistName} releases new music,
        announces tours &amp; more. Tap the bell to manage your alerts.
      </p>
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
        We sent a confirmation link to your email. Click it to start receiving
        updates from this artist.
      </p>
    </div>
  );
}
