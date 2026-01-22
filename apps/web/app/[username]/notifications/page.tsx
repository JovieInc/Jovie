'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Input } from '@/components/atoms/Input';
import { ErrorBanner } from '@/components/feedback/ErrorBanner';
import { StarterEmptyState } from '@/components/feedback/StarterEmptyState';
import { track } from '@/lib/analytics';
import { useNotifications } from '@/lib/hooks/useNotifications';
import {
  getNotificationSubscribeSuccessMessage,
  NOTIFICATION_COPY,
} from '@/lib/notifications/client';
import { normalizeSubscriptionEmail } from '@/lib/notifications/validation';
import { useSubscribeNotificationsMutation } from '@/lib/queries';
import { usePublicProfileQuery } from '@/lib/queries/usePublicProfileQuery';

export default function NotificationsPage() {
  const params = useParams();
  const rawUsername = (params as Record<string, unknown> | null | undefined)
    ?.username;

  const resolveUsername = (): string => {
    if (typeof rawUsername === 'string') return rawUsername;
    if (Array.isArray(rawUsername)) return String(rawUsername[0] ?? '');
    return '';
  };
  const username = resolveUsername();

  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const { success: notifySuccess, error: notifyError } = useNotifications();
  const subscribeMutation = useSubscribeNotificationsMutation();
  const notificationsEnabled = true;

  // Fetch artist data using TanStack Query - handles caching, retry, abort automatically
  const {
    data: artistData,
    isLoading: isArtistLoading,
    error: artistQueryError,
  } = usePublicProfileQuery({
    username,
    enabled: notificationsEnabled && Boolean(username),
  });

  const artistId = artistData?.id ?? null;

  // Determine lookup error - either query failed or no username provided
  const artistLookupError =
    artistQueryError || !username
      ? NOTIFICATION_COPY.errors.artistNotFound
      : null;

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

  if (!isArtistLoading && artistLookupError) {
    return (
      <div className='container mx-auto px-4 py-8 max-w-xl'>
        <StarterEmptyState
          title="We couldn't find that artist"
          description={artistLookupError}
          primaryAction={{ label: 'Return home', href: '/' }}
          secondaryAction={{ label: 'View profile', href: `/${username}` }}
          testId='notifications-artist-missing'
        />
      </div>
    );
  }

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!artistId) {
      const errorMessage = NOTIFICATION_COPY.errors.artistUnavailable;
      setError(errorMessage);
      notifyError(errorMessage);
      return;
    }

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
      await subscribeMutation.mutateAsync({
        artistId,
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
              inputClassName='w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background'
            />
          </div>

          <button
            type='submit'
            disabled={isSubmitting}
            className='w-full rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary'
          >
            {isSubmitting ? 'Subscribing...' : 'Turn on notifications'}
          </button>

          <p className='text-xs text-secondary-token mt-2'>
            By subscribing, you agree to receive automated updates. Reply STOP
            to unsubscribe.{' '}
            <Link href='/terms' className='underline'>
              Terms
            </Link>{' '}
            <Link href='/privacy' className='underline'>
              Privacy
            </Link>
          </p>
        </form>
      )}
    </div>
  );
}
