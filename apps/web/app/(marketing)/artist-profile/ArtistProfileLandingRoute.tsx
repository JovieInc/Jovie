import { MarketingPageShell } from '@/components/marketing';
import { ArtistProfileLandingPage } from '@/components/marketing/artist-profile';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import {
  ARTIST_PROFILE_LAUNCH_FEATURES,
  ARTIST_PROFILE_SPEC_TILES,
} from '@/data/artistProfileFeatures';
import { ARTIST_PROFILE_SOCIAL_PROOF } from '@/data/socialProof';
import { ARTIST_PROFILE_FLAGS } from '@/lib/featureFlags';

export function ArtistProfileLandingRoute() {
  return (
    <MarketingPageShell>
      <ArtistProfileLandingPage
        copy={ARTIST_PROFILE_COPY}
        launchFeatures={ARTIST_PROFILE_LAUNCH_FEATURES}
        specTiles={ARTIST_PROFILE_SPEC_TILES}
        socialProof={ARTIST_PROFILE_SOCIAL_PROOF}
        flags={ARTIST_PROFILE_FLAGS}
        payFlowVideoUrl={process.env.ARTIST_PROFILES_PAY_FLOW_VIDEO_URL}
      />
    </MarketingPageShell>
  );
}
