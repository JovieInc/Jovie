// @coverage-via apps/web/tests/unit/marketing/component-registry.test.ts
import { MarketingPageShell } from '@/components/marketing';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import { ARTIST_PROFILE_FLAGS } from '@/lib/featureFlags';
import { ArtistProfileLandingPage } from './ArtistProfileLandingPage';
import './ArtistProfileLandingPage.css';

export function ArtistProfileLandingRoute() {
  return (
    <MarketingPageShell
      className='artist-profiles-home-system'
      penContractId={MARKETING_PEN_CONTRACT_IDS.recipe.artistLp}
    >
      <ArtistProfileLandingPage
        copy={ARTIST_PROFILE_COPY}
        flags={ARTIST_PROFILE_FLAGS}
      />
    </MarketingPageShell>
  );
}
