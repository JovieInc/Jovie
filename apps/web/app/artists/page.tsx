import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { ArtistsDirectory } from '@/components/organisms/ArtistsDirectory';
import { StandaloneProductPage } from '@/components/organisms/StandaloneProductPage';
import { loadArtistsDirectoryProfiles } from '@/lib/profile/public-discovery-catalog';

export const dynamic = 'force-dynamic';

export default async function ArtistsPage() {
  const catalog = await loadArtistsDirectoryProfiles();

  if (catalog.status === 'unavailable') {
    return renderFallback();
  }

  return <ArtistsDirectory profiles={catalog.profiles} />;
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
