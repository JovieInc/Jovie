'use client';

import { useFeatureGate } from '@statsig/react-bindings';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { z } from 'zod';
import { track } from '@/lib/analytics';
import { STATSIG_FLAGS } from '@/lib/statsig/flags';

// Email validation schema
const emailSchema = z.string().email('Please enter a valid email address');

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

  const notificationsGate = useFeatureGate(STATSIG_FLAGS.NOTIFICATIONS);

  if (!notificationsGate.value) {
    return (
      <div className='container mx-auto px-4 py-8 max-w-md'>
        <h1 className='text-2xl font-bold mb-6'>
          Notifications are not available yet
        </h1>
        <p className='text-gray-600 dark:text-gray-400'>
          We&apos;re focused on getting the core Jovie profile experience right
          before launching notifications.
        </p>
      </div>
    );
  }

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Client-side validation
    try {
      emailSchema.parse(email);
    } catch (err) {
      if (err instanceof z.ZodError) {
        const errorMessage = err.format()._errors[0] || 'Invalid email';
        setError(errorMessage);

        // Track form validation error
        track('notifications_subscribe_error', {
          error_type: 'validation_error',
          error_message: errorMessage,
          source: 'notifications_page',
        });

        return;
      }
    }

    setIsSubmitting(true);

    // Track form submission attempt
    track('notifications_subscribe_attempt', {
      email_length: email.length,
      source: 'notifications_page',
    });

    try {
      // In a real implementation, we would:
      // 1. Fetch the artist_id from the username
      // 2. Submit the subscription request

      // For now, we'll just simulate the API call
      const response = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          artist_id: '00000000-0000-0000-0000-000000000000', // This would be fetched from the username
          email,
          source: 'notifications_page',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to subscribe');
      }

      // Track successful subscription
      track('notifications_subscribe_success', {
        email_domain: email.split('@')[1],
        source: 'notifications_page',
      });

      setSuccess(true);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);

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
        <div className='bg-green-50 border border-green-200 rounded-lg p-4 mb-4'>
          <p className='text-green-800'>
            You&apos;ll get updates from {username} when they release new
            content.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className='space-y-4'>
          <div>
            <label htmlFor='email' className='block text-sm font-medium mb-1'>
              Email
            </label>
            <input
              type='email'
              id='email'
              value={email}
              onChange={e => setEmail(e.target.value)}
              className='w-full px-4 py-2 border rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-blue-500'
              placeholder='your@email.com'
              required
            />
            {error && <p className='mt-1 text-sm text-red-600'>{error}</p>}
          </div>

          <button
            type='submit'
            disabled={isSubmitting}
            className='w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg disabled:opacity-50'
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
