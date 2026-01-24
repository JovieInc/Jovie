import { type Metadata } from 'next';
import { unstable_cache } from 'next/cache';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { loadUpcomingTourDates } from '@/app/app/dashboard/tour-dates/actions';
import { Icon } from '@/components/atoms/Icon';
import { PROFILE_URL } from '@/constants/app';
import { getCreatorProfileWithLinks } from '@/lib/db/queries';
import { STATSIG_FLAGS } from '@/lib/flags';
import { checkGateForUser } from '@/lib/flags/server';
import { TourDateCard } from './TourDateCard';

// Feature flag check timeout to avoid blocking render
const FLAG_CHECK_TIMEOUT_MS = 100;

interface Props {
  params: Promise<{ username: string }>;
}

// Cache profile lookup for 5 minutes
const getCachedProfile = cache(async (username: string) => {
  const normalizedUsername = username.toLowerCase().trim();

  return unstable_cache(
    async () => {
      const result = await getCreatorProfileWithLinks(normalizedUsername);
      return result;
    },
    [`tour-profile-${normalizedUsername}`],
    { revalidate: 300 }
  )();
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const profile = await getCachedProfile(username);

  if (!profile) {
    return {
      title: 'Tour Dates Not Found',
    };
  }

  const artistName = profile.displayName || profile.username;
  const title = `${artistName} Tour Dates`;
  const description = `See upcoming tour dates and shows for ${artistName}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${PROFILE_URL}/${username}/tour`,
      siteName: 'Jovie',
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  };
}

/**
 * Non-blocking feature flag check with timeout.
 * Returns false if the check takes too long, avoiding render delays.
 */
async function checkTourDatesEnabled(clerkId: string | null): Promise<boolean> {
  if (!clerkId) return false;

  try {
    const result = await Promise.race([
      checkGateForUser(STATSIG_FLAGS.TOUR_DATES, { userID: clerkId }),
      new Promise<false>(resolve =>
        setTimeout(() => resolve(false), FLAG_CHECK_TIMEOUT_MS)
      ),
    ]);
    return result;
  } catch {
    // Fail closed - don't show tour dates if flag check fails
    return false;
  }
}

export default async function TourPage({ params }: Props) {
  const { username } = await params;
  const profile = await getCachedProfile(username);

  if (!profile || !profile.isPublic) {
    notFound();
  }

  // Check if tour dates feature is enabled for this creator
  const creatorClerkId =
    typeof profile.userClerkId === 'string' ? profile.userClerkId : null;
  const isTourDatesEnabled = await checkTourDatesEnabled(creatorClerkId);

  if (!isTourDatesEnabled) {
    notFound();
  }

  const artistName = profile.displayName || profile.username;

  // Load upcoming tour dates
  const tourDates = await loadUpcomingTourDates(profile.id);

  return (
    <div className='min-h-screen bg-surface-0'>
      {/* Header */}
      <header className='sticky top-0 z-10 border-b border-subtle bg-surface-1/95 backdrop-blur supports-[backdrop-filter]:bg-surface-1/60'>
        <div className='mx-auto max-w-2xl px-4 py-4'>
          <Link
            href={`/${username}`}
            className='inline-flex items-center gap-2 text-sm text-secondary-token hover:text-primary-token'
          >
            <Icon name='ArrowLeft' className='h-4 w-4' />
            Back to {artistName}
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className='mx-auto max-w-2xl px-4 py-8'>
        <div className='mb-8'>
          <h1 className='text-2xl font-bold text-primary-token'>
            {artistName} Tour Dates
          </h1>
          <p className='mt-1 text-secondary-token'>
            {tourDates.length > 0
              ? `${tourDates.length} upcoming ${tourDates.length === 1 ? 'show' : 'shows'}`
              : 'No upcoming shows'}
          </p>
        </div>

        {tourDates.length > 0 ? (
          <div className='space-y-4'>
            {tourDates.map(tourDate => (
              <TourDateCard key={tourDate.id} tourDate={tourDate} />
            ))}
          </div>
        ) : (
          <div className='rounded-xl border border-subtle bg-surface-1 p-8 text-center'>
            <Icon
              name='CalendarX2'
              className='mx-auto h-12 w-12 text-tertiary-token'
            />
            <p className='mt-4 text-secondary-token'>
              No upcoming shows scheduled
            </p>
            <p className='mt-1 text-sm text-tertiary-token'>
              Check back later for updates
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
