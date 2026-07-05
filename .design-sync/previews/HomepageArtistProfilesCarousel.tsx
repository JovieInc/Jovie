// Authored preview — HomepageArtistProfilesCarousel. The homepage artist-profile
// card carousel. Cards mirror apps/web/data/homepageLaunchCopy.ts artistProfiles
// (title + glow), with self-contained data-URI phone screenshots.
import { HomepageArtistProfilesCarousel } from 'apps/web/components';
import { IMG } from './_images';

const CARDS = [
  {
    id: 'get-paid',
    title: 'Get Paid',
    image: IMG.profilePay,
    glow: 'cyan' as const,
  },
  {
    id: 'drive-streams',
    title: 'Drive Streams',
    image: IMG.profileListen,
    glow: 'blue' as const,
  },
  {
    id: 'capture-fans',
    title: 'Capture Fans',
    image: IMG.profileSubscribe,
    glow: 'violet' as const,
  },
  {
    id: 'sell-out',
    title: 'Sell Out',
    image: IMG.profileTour,
    glow: 'magenta' as const,
  },
  {
    id: 'drop-music',
    title: 'Drop Music',
    image: IMG.profilePresave,
    glow: 'aurora' as const,
  },
];

export function Carousel() {
  return <HomepageArtistProfilesCarousel cards={CARDS} />;
}
