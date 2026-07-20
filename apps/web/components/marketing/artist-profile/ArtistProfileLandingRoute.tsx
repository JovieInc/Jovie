import { MarketingPageShell } from '@/components/marketing';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { ARTIST_PROFILE_TRUTH_TILES } from '@/data/artistProfileFeatures';
import { ARTIST_PROFILE_SOCIAL_PROOF } from '@/data/socialProof';
import { ARTIST_PROFILE_FLAGS } from '@/lib/featureFlags';
import { ArtistProfileLandingPage } from './ArtistProfileLandingPage';

export function ArtistProfileLandingRoute() {
  return (
    <MarketingPageShell>
      <ArtistProfileLandingPage
        copy={ARTIST_PROFILE_COPY}
        truthTiles={ARTIST_PROFILE_TRUTH_TILES}
        socialProof={ARTIST_PROFILE_SOCIAL_PROOF}
        flags={ARTIST_PROFILE_FLAGS}
      />
    </MarketingPageShell>
  );
}
