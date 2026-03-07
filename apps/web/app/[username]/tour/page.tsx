import { type Metadata } from 'next';
import { unstable_cache } from 'next/cache';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { loadUpcomingTourDates } from '@/app/app/(shell)/dashboard/tour-dates/actions';
import { Icon } from '@/components/atoms/Icon';
import { BASE_URL } from '@/constants/app';
import { getProfileWithLinks as getCreatorProfileWithLinks } from '@/lib/services/profile';
import { TourDatesList } from './TourDatesList';

interface Props {
  readonly params: Promise<{ username: string }>;
}

const TOUR_PROFILE_CACHE_TTL_SECONDS = 300; // 5 minutes

// Cache profile lookup — only caches truthy (found) results.
// Null/not-found results are never cached to prevent sticky 404s.
const getCachedProfile = cache(async (username: string) => {
  const normalizedUsername = username.toLowerCase().trim();

  // Skip cache in test/development to avoid stale data
  if (
    process.env.NODE_ENV === 'test' ||
    process.env.NODE_ENV === 'development'
  ) {
    return getCreatorProfileWithLinks(normalizedUsername);
  }

  try {
    return await unstable_cache(
      async () => {
        const result = await getCreatorProfileWithLinks(normalizedUsername);
        if (!result) {
          throw new Error('profile_not_found');
        }
        return result;
      },
      [`tour-profile-${normalizedUsername}`],
      {
        tags: ['profiles-all', `profile:${normalizedUsername}`],
        revalidate: TOUR_PROFILE_CACHE_TTL_SECONDS,
      }
    )();
  } catch {
    // Cache miss for null result or cache failure — fetch directly
    return getCreatorProfileWithLinks(normalizedUsername);
  }
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
    alternates: {
      canonical: `${BASE_URL}/${username.toLowerCase()}/tour`,
    },
    openGraph: {
      title,
      description,
      url: `${BASE_URL}/${username.toLowerCase()}/tour`,
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
 * Format the tour dates count message
 */
function formatTourDatesCount(count: number): string {
  if (count === 0) {
    return 'No upcoming shows';
  }
  const showWord = count === 1 ? 'show' : 'shows';
  return `${count} upcoming ${showWord}`;
}

export default async function TourPage({ params }: Readonly<Props>) {
  const { username } = await params;
  const profile = await getCachedProfile(username);

  if (!profile?.isPublic) {
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
            className='inline-flex items-center gap-1.5 text-sm text-secondary-token transition-colors duration-normal hover:text-primary-token'
          >
            <Icon name='ArrowLeft' className='h-4 w-4' />
            Back to {artistName}
          </Link>
        </div>
      </header>

      {/* Content */}
      <main id='main-content' className='mx-auto max-w-2xl px-4 py-6'>
        <div className='mb-6'>
          <h1 className='text-2xl font-[var(--font-weight-medium)] tracking-tight text-primary-token'>
            {artistName} Tour Dates
          </h1>
          <p className='mt-1 text-sm text-secondary-token'>
            {formatTourDatesCount(tourDates.length)}
          </p>
        </div>

        {tourDates.length > 0 ? (
          <TourDatesList tourDates={tourDates} />
        ) : (
          <div className='rounded-lg border border-subtle bg-surface-1 p-8 text-center'>
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
