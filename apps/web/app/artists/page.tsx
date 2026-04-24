import * as Sentry from '@sentry/nextjs';
import { asc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { Icon } from '@/components/atoms/Icon';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { OptimizedImage } from '@/components/molecules/OptimizedImage';
import { StandaloneProductPage } from '@/components/organisms/StandaloneProductPage';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';

export const revalidate = 3600;

export default async function ArtistsPage() {
  let profiles: Array<{
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    bio: string | null;
  }> = [];
  let error = false;

  try {
    if (!process.env.DATABASE_URL) {
      return renderFallback();
    }

    profiles = await db
      .select({
        id: creatorProfiles.id,
        username: creatorProfiles.username,
        displayName: creatorProfiles.displayName,
        avatarUrl: creatorProfiles.avatarUrl,
        bio: creatorProfiles.bio,
      })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.isPublic, true))
      .orderBy(asc(creatorProfiles.displayName));
  } catch (err) {
    Sentry.captureException(err);
    error = true;
  }

  if (error) {
    return renderFallback();
  }

  return (
    <StandaloneProductPage width='xl'>
      <div className='space-y-6'>
        <ContentSurfaceCard surface='details'>
          <ContentSectionHeader
            density='compact'
            title='All artists'
            subtitle='Discover public creator profiles across Jovie.'
          />
          <div className='grid grid-cols-1 gap-3 p-3 pt-0 sm:grid-cols-3 sm:p-4 sm:pt-0'>
            <ContentSurfaceCard surface='nested' className='space-y-1 p-4'>
              <p className='text-2xl font-semibold tracking-[-0.03em] text-primary-token'>
                {profiles.length}
              </p>
              <p className='text-[12px] font-semibold uppercase tracking-[0.14em] text-tertiary-token'>
                Public profiles
              </p>
              <p className='text-[13px] leading-5 text-secondary-token'>
                Creator pages currently available to browse.
              </p>
            </ContentSurfaceCard>
            <ContentSurfaceCard surface='nested' className='space-y-1 p-4'>
              <p className='text-[13px] font-semibold text-primary-token'>
                Discover artists
              </p>
              <p className='text-[13px] leading-5 text-secondary-token'>
                Browse creator pages, profile themes, and public fan
                experiences.
              </p>
            </ContentSurfaceCard>
            <ContentSurfaceCard surface='nested' className='space-y-1 p-4'>
              <p className='text-[13px] font-semibold text-primary-token'>
                Jump straight in
              </p>
              <p className='text-[13px] leading-5 text-secondary-token'>
                Every card opens the artist&apos;s public profile in one click.
              </p>
            </ContentSurfaceCard>
          </div>
        </ContentSurfaceCard>

        {profiles.length > 0 ? (
          <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
            {profiles.map(profile => (
              <ContentSurfaceCard key={profile.id} surface='nested'>
                <Link
                  href={'/' + profile.username}
                  className='group flex h-full flex-col items-center gap-3 p-5 text-center transition-colors'
                >
                  <div className='h-24 w-24'>
                    <OptimizedImage
                      src={profile.avatarUrl}
                      alt={
                        (profile.displayName || profile.username) +
                        ' creator profile'
                      }
                      size='xl'
                      shape='circle'
                      className='mx-auto'
                      aspectRatio='square'
                      sizes='(max-width: 640px) 96px, (max-width: 1024px) 96px, 96px'
                    />
                  </div>

                  <div className='space-y-1'>
                    <h2 className='text-[15px] font-semibold text-primary-token transition-colors group-hover:text-secondary-token'>
                      {profile.displayName || profile.username}
                    </h2>
                    {profile.bio ? (
                      <p className='line-clamp-3 text-[13px] leading-5 text-secondary-token'>
                        {profile.bio}
                      </p>
                    ) : (
                      <p className='text-[13px] leading-5 text-tertiary-token'>
                        Public creator profile on Jovie.
                      </p>
                    )}
                  </div>

                  <span className='inline-flex items-center gap-1 text-[12px] font-semibold text-tertiary-token transition-colors group-hover:text-primary-token'>
                    View profile
                    <Icon name='ChevronRight' className='h-4 w-4' />
                  </span>
                </Link>
              </ContentSurfaceCard>
            ))}
          </div>
        ) : (
          <ContentSurfaceCard surface='details'>
            <div className='px-5 py-8 text-center sm:px-6'>
              <p className='text-[15px] font-semibold text-primary-token'>
                No profiles found
              </p>
              <p className='mt-2 text-[13px] leading-5 text-secondary-token'>
                Check back later for new creator profiles.
              </p>
            </div>
          </ContentSurfaceCard>
        )}
      </div>
    </StandaloneProductPage>
  );
}

function renderFallback() {
  return (
    <StandaloneProductPage width='lg' centered>
      <ContentSurfaceCard surface='details' className='overflow-hidden'>
        <ContentSectionHeader
          density='compact'
          title='Profiles are loading'
          subtitle='Please check back shortly once the connection is available.'
        />
        <div className='px-5 py-8 text-center sm:px-6'>
          <p className='text-[13px] leading-5 text-secondary-token'>
            Public creator data is temporarily unavailable.
          </p>
        </div>
      </ContentSurfaceCard>
    </StandaloneProductPage>
  );
}
