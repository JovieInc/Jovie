import { MarketingPageShell } from '@/components/marketing';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { ARTIST_PROFILE_FLAGS } from '@/lib/featureFlags';
import { ArtistProfileLandingPage } from './ArtistProfileLandingPage';
import './ArtistProfileLandingPage.css';

export function ArtistProfileLandingRoute() {
  return (
    <MarketingPageShell className='artist-profiles-home-system'>
      <ArtistProfileLandingPage
        copy={ARTIST_PROFILE_COPY}
        flags={ARTIST_PROFILE_FLAGS}
      />
    </MarketingPageShell>
  );
}
