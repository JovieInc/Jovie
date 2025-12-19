'use client';

import { useFeatureGate } from '@statsig/react-bindings';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Input } from '@/components/atoms/Input';
import { ErrorBanner } from '@/components/feedback/ErrorBanner';
import { StarterEmptyState } from '@/components/feedback/StarterEmptyState';
import { track } from '@/lib/analytics';
import { useNotifications } from '@/lib/hooks/useNotifications';
import {
  getNotificationSubscribeSuccessMessage,
  NOTIFICATION_COPY,
  subscribeToNotifications,
} from '@/lib/notifications/client';
import { normalizeSubscriptionEmail } from '@/lib/notifications/validation';
import { STATSIG_FLAGS } from '@/lib/statsig/flags';

export default function NotificationsPage() {
  const params = useParams();
  const rawUsername = (params as Record<string, unknown> | null | undefined)
    ?.username;
  const username =
    typeof rawUsername === 'string'
      ? rawUsername
      : Array.isArray(rawUsername)
        ? String(rawUsername[0] ?? '')
        : '';

  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const { success: notifySuccess, error: notifyError } = useNotifications();
  const searchParams = useSearchParams();

  const notificationsGate = useFeatureGate(STATSIG_FLAGS.NOTIFICATIONS);
  const forceNotifications = searchParams?.get('preview') === '1';
  const notificationsEnabled = notificationsGate.value || forceNotifications;

  if (!notificationsEnabled) {
    return (
      <div className='container mx-auto px-4 py-8 max-w-xl'>
        <StarterEmptyState
          title='Notifications are not available yet'
          description="We're focused on the core Jovie experience. Opt-in will be back soon once we're confident in reliability."
          primaryAction={{ label: 'Return home', href: '/' }}
          secondaryAction={{ label: 'View profile', href: `/${username}` }}
          testId='notifications-disabled'
        />
      </div>
    );
  }

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Client-side validation
    const normalizedEmail = normalizeSubscriptionEmail(email);
    if (!normalizedEmail) {
      const errorMessage = 'Please enter a valid email address';
      setError(errorMessage);
      notifyError(errorMessage);

      // Track form validation error
      track('notifications_subscribe_error', {
        error_type: 'validation_error',
        error_message: errorMessage,
        source: 'notifications_page',
      });

      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(false);

    // Track form submission attempt
    track('notifications_subscribe_attempt', {
      email_length: normalizedEmail.length,
      source: 'notifications_page',
    });

    try {
      // In a real implementation, we would:
      // 1. Fetch the artist_id from the username
      // 2. Submit the subscription request

      // For now, we'll just simulate the API call
      await subscribeToNotifications({
        artistId: '00000000-0000-0000-0000-000000000000', // TODO: replace with resolved artist id
        channel: 'email',
        email: normalizedEmail,
        source: 'notifications_page',
      });

      // Track successful subscription
      track('notifications_subscribe_success', {
        email_domain: normalizedEmail.split('@')[1],
        source: 'notifications_page',
      });

      setSuccess(true);
      notifySuccess(getNotificationSubscribeSuccessMessage('email'));
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : NOTIFICATION_COPY.errors.subscribe;
      setError(errorMessage || NOTIFICATION_COPY.errors.subscribe);
      notifyError(NOTIFICATION_COPY.errors.subscribe);

      // Track submission error
      track('notifications_subscribe_error', {
        error_type: 'submission_error',
        error_message: errorMessage,
        source: 'notifications_page',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className='container mx-auto px-4 py-8 max-w-md'>
      <h1 className='text-2xl font-bold mb-6'>Get updates from {username}</h1>

      {success ? (
        <StarterEmptyState
          title='Notifications enabled'
          description={`You will get updates from ${username} when they release new content.`}
          primaryAction={{ label: 'View profile', href: `/${username}` }}
          secondaryAction={{ label: 'Return home', href: '/' }}
          testId='notifications-success'
        />
      ) : (
        <form onSubmit={handleSubmit} className='space-y-4'>
          {error ? (
            <ErrorBanner
              title='Could not save your notification request'
              description={error}
              actions={[{ label: 'Try again', onClick: () => setError(null) }]}
              testId='notifications-error'
            />
          ) : null}

          <div>
            <label htmlFor='email' className='block text-sm font-medium mb-1'>
              Email
            </label>
            <Input
              type='email'
              id='email'
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder='your@email.com'
              required
              inputClassName='w-full px-4 py-2 border rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-blue-500'
            />
          </div>

          <button
            type='submit'
            disabled={isSubmitting}
            className='w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md disabled:opacity-50'
          >
            {isSubmitting ? 'Subscribing...' : 'Turn on notifications'}
          </button>

          <p className='text-xs text-gray-500 mt-2'>
            By subscribing, you agree to receive automated updates. Reply STOP
            to unsubscribe.{' '}
            <Link href='/terms' className='underline'>
              Terms
            </Link>{' '}
            •{' '}
            <Link href='/privacy' className='underline'>
              Privacy
            </Link>
          </p>
        </form>
      )}
    </div>
  );
}
