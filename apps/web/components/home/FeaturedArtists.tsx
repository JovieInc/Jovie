import { FeaturedCreatorsSection } from '@/components/organisms/FeaturedArtistsSection';
import { getFeaturedCreators } from '@/lib/featured-creators';

export const revalidate = 60 * 60 * 24 * 7;

export async function FeaturedArtists() {
  const creators = await getFeaturedCreators();
  if (!creators.length) return null;
  return (
    <FeaturedCreatorsSection
      creators={creators}
      showTitle={false}
      showNames={false}
    />
  );
}
