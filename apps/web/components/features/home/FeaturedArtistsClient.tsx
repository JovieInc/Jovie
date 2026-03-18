import { NewFeaturedArtists } from './NewFeaturedArtists';

export interface FeaturedArtistsClientProps {
  readonly showFades?: boolean;
}

export function FeaturedArtistsClient({
  showFades,
}: FeaturedArtistsClientProps) {
  return <NewFeaturedArtists showFades={showFades} />;
}
