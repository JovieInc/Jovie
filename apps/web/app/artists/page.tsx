import * as Sentry from '@sentry/nextjs';
import { and, asc, eq } from 'drizzle-orm';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import {
  ArtistsDirectory,
  type ArtistsDirectoryProfile,
} from '@/components/organisms/ArtistsDirectory';
import { StandaloneProductPage } from '@/components/organisms/StandaloneProductPage';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';

export const revalidate = 3600;

export default async function ArtistsPage() {
  let profiles: ArtistsDirectoryProfile[] = [];
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
      .where(
        and(
          eq(creatorProfiles.isPublic, true),
          eq(creatorProfiles.isClaimed, true)
        )
      )
      .orderBy(asc(creatorProfiles.displayName));
  } catch (err) {
    Sentry.captureException(err);
    error = true;
  }

  if (error) {
    return renderFallback();
  }

  return <ArtistsDirectory profiles={profiles} />;
}

function renderFallback() {
  return (
    <StandaloneProductPage width='lg' centered>
      <ContentSurfaceCard surface='details' className='overflow-hidden'>
        <ContentSectionHeader
          density='compact'
          headingLevel='h1'
          title='Profiles are loading'
          subtitle='Please check back shortly once the connection is available.'
        />
        <div className='px-5 py-8 text-center sm:px-6'>
          <p className='text-app leading-5 text-secondary-token'>
            Public creator data is temporarily unavailable.
          </p>
        </div>
      </ContentSurfaceCard>
    </StandaloneProductPage>
  );
}
