import { MarketingPageShell } from '@/components/marketing';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import {
  ARTIST_PROFILE_LAUNCH_FEATURES,
  ARTIST_PROFILE_SPEC_TILES,
  ARTIST_PROFILE_SPEC_TILES_BASE,
} from '@/data/artistProfileFeatures';
import { ARTIST_PROFILE_SOCIAL_PROOF } from '@/data/socialProof';
import { ARTIST_PROFILE_FLAGS } from '@/lib/featureFlags';
import { FEATURE_FLAGS } from '@/lib/flags/marketing-static';
import { ArtistProfileLandingPage } from './ArtistProfileLandingPage';

export function ArtistProfileLandingRoute() {
  return (
    <MarketingPageShell>
      <ArtistProfileLandingPage
        copy={ARTIST_PROFILE_COPY}
        launchFeatures={ARTIST_PROFILE_LAUNCH_FEATURES}
        specTiles={
          FEATURE_FLAGS.SHOW_FORGEUI_MARKETING_UPDATES
            ? ARTIST_PROFILE_SPEC_TILES
            : ARTIST_PROFILE_SPEC_TILES_BASE
        }
        socialProof={ARTIST_PROFILE_SOCIAL_PROOF}
        flags={ARTIST_PROFILE_FLAGS}
        payFlowVideoUrl={process.env.ARTIST_PROFILES_PAY_FLOW_VIDEO_URL}
        showForgeUiMarketingUpdates={
          FEATURE_FLAGS.SHOW_FORGEUI_MARKETING_UPDATES
        }
      />
    </MarketingPageShell>
  );
}
