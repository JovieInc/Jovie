'use client';

import { useEffect, useMemo, useState } from 'react';
import { useDashboardData } from '@/app/dashboard/DashboardDataContext';
import { SectionHeader } from '@/components/dashboard/molecules/SectionHeader';
import { Artist, convertDrizzleCreatorProfileToArtist } from '@/types/db';

type SubscriberRow = {
  id: string;
  email: string | null;
  phone: string | null;
  countryCode: string | null;
  createdAt: string;
  channel: 'email' | 'phone';
};

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
}

function flagFromCountry(code: string | null): string {
  if (!code || code.length < 2) return '🏳️';
  const upper = code.slice(0, 2).toUpperCase();

  const first = upper.codePointAt(0);
  const second = upper.codePointAt(1);

  if (
    !first ||
    !second ||
    first < 65 ||
    second < 65 ||
    first > 90 ||
    second > 90
  ) {
    return '🏳️';
  }

  return String.fromCodePoint(0x1f1e6 + (first - 65), 0x1f1e6 + (second - 65));
}

function formatCountryLabel(code: string | null): string {
  if (!code || code.length < 2) return 'Unknown';

  const upper = code.slice(0, 2).toUpperCase();
  return /^[A-Z]{2}$/.test(upper) ? upper : 'Unknown';
}

export function DashboardAudience() {
  const dashboardData = useDashboardData();
  const artist = useMemo<Artist | null>(
    () =>
      dashboardData.selectedProfile
        ? convertDrizzleCreatorProfileToArtist(dashboardData.selectedProfile)
        : null,
    [dashboardData.selectedProfile]
  );

  const [subscribers, setSubscribers] = useState<SubscriberRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    if (!artist?.id) {
      setSubscribers([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const loadSubscribers = async () => {
      try {
        const response = await fetch(
          `/api/dashboard/audience/subscribers?profileId=${artist.id}`
        );
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
          subscribers?: SubscriberRow[];
        } | null;

        if (!response.ok) {
          throw new Error(payload?.error || 'Unable to load subscribers');
        }

        if (!isActive) return;
        setSubscribers(payload?.subscribers ?? []);
      } catch (err) {
        if (!isActive) return;
        const message =
          err instanceof Error ? err.message : 'Failed to load subscribers';
        setError(message);
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    void loadSubscribers();

    return () => {
      isActive = false;
    };
  }, [artist?.id]);

  if (!artist) {
    return null;
  }

  return (
    <div className='space-y-6'>
      <div>
        <h1 className='text-2xl font-bold text-primary-token'>Audience CRM</h1>
        <p className='text-secondary-token mt-1'>
          People who tapped notifications on your profile
        </p>
      </div>

      <div className='overflow-hidden rounded-lg border border-subtle bg-surface-1 shadow-sm'>
        <SectionHeader
          title='Notification signups'
          description='Contacts captured from your notification input'
          right={
            <span className='rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-secondary-token'>
              {subscribers.length}{' '}
              {subscribers.length === 1 ? 'signup' : 'signups'}
            </span>
          }
        />

        {error ? (
          <div className='px-6 py-4 text-sm text-red-500 bg-surface-2/60'>
            {error}
          </div>
        ) : null}

        {isLoading ? (
          <div className='px-6 py-10 text-sm text-secondary-token'>
            Loading notification signups...
          </div>
        ) : subscribers.length === 0 ? (
          <div className='px-6 py-10 text-sm text-secondary-token'>
            No one has subscribed yet. Share your profile and prompt fans to tap
            the bell.
          </div>
        ) : (
          <div className='overflow-x-auto'>
            <table className='min-w-full divide-y divide-subtle'>
              <thead className='bg-surface-2/50'>
                <tr>
                  <th className='px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-secondary-token'>
                    Email
                  </th>
                  <th className='px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-secondary-token'>
                    Phone
                  </th>
                  <th className='px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-secondary-token'>
                    Country
                  </th>
                  <th className='px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-secondary-token'>
                    Signed up
                  </th>
                </tr>
              </thead>
              <tbody className='divide-y divide-subtle'>
                {subscribers.map(subscriber => (
                  <tr key={subscriber.id} className='hover:bg-surface-2/30'>
                    <td className='px-6 py-4 whitespace-nowrap text-sm text-primary-token'>
                      {subscriber.email ?? '—'}
                    </td>
                    <td className='px-6 py-4 whitespace-nowrap text-sm text-primary-token'>
                      {subscriber.phone ?? '—'}
                    </td>
                    <td className='px-6 py-4 whitespace-nowrap text-sm text-primary-token'>
                      <span className='inline-flex items-center gap-2'>
                        <span aria-hidden='true' className='text-lg'>
                          {flagFromCountry(subscriber.countryCode)}
                        </span>
                        <span className='text-sm text-secondary-token'>
                          {formatCountryLabel(subscriber.countryCode)}
                        </span>
                      </span>
                    </td>
                    <td className='px-6 py-4 whitespace-nowrap text-sm text-primary-token'>
                      {formatDate(subscriber.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
