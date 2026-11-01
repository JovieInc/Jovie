import type { ProductShotId } from '@/lib/screenshots/product-shots';
import { getMarketingExportImage } from '@/lib/screenshots/registry';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';

export type JovieMarketingAccent = 'blue' | 'pink' | 'purple';

/**
 * One profile state per tile. The shot is the real component that changes
 * in that state, captured by the screenshot catalog (`profile-state-*`), so
 * the differentiating UI is the whole crop. Titles say what the artist gets;
 * the identity header is not repeated in every tile.
 */
export interface ProfileStateTile {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly scenarioId: string;
  readonly alt: string;
}

interface PlatformSpecTileBase {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly accent: JovieMarketingAccent;
  readonly layoutClassName: string;
  readonly kind: 'phone' | 'desktop';
}

/**
 * A tile shows either a registry product shot (preferred: cropped to one
 * moment, `lib/screenshots/product-shots.ts`) or a legacy catalog scenario.
 */
export type PlatformSpecTile = PlatformSpecTileBase &
  (
    | {
        /** Alt text comes from the shot spec. */
        readonly shot: ProductShotId;
        readonly scenarioId?: never;
        readonly alt?: never;
      }
    | {
        readonly scenarioId: string;
        readonly alt: string;
        readonly shot?: never;
      }
  );

const LIVE_PROFILE_HREF = TIM_WHITE_PROFILE.publicProfilePath;

export const SHIPPED_SITES_SHOWCASE_COPY = {
  headline: 'The profile in action.',
  body: 'One profile, shown with demo data. Open Tim White’s profile to see it live.',
  liveProfileHref: LIVE_PROFILE_HREF,
  liveProfileLabel: 'Open the live profile',
} as const;

export const PLATFORM_SPEC_BENTO_COPY = {
  headline: 'The Artist Platform',
  body: 'Profiles, capture, routing, and audience signal.',
} as const;

export const PROFILE_STATE_TILES: readonly ProfileStateTile[] = [
  {
    id: 'shows',
    title: 'Shows lead when you tour.',
    body: 'Upcoming dates come first, each with its ticket link.',
    scenarioId: 'profile-state-shows-mobile',
    alt: 'Jovie profile events card listing upcoming shows with ticket buttons.',
  },
  {
    id: 'release',
    title: 'New music leads on release day.',
    body: 'Your latest release is the first thing a visitor sees.',
    scenarioId: 'profile-state-release-mobile',
    alt: 'Jovie profile featured release card with a Listen now button.',
  },
  {
    id: 'capture',
    title: 'Visits turn into your list.',
    body: 'One step turns a visit into an email or text you can reach.',
    scenarioId: 'profile-state-capture-mobile',
    alt: 'Jovie profile signup card collecting an email address for new music.',
  },
] as const;

export const PLATFORM_SPEC_TILES: readonly PlatformSpecTile[] = [
  {
    id: 'adaptive-profile',
    title: 'One Adaptive Profile',
    body: 'The same artist site puts the right action first as the release moment changes.',
    accent: 'purple',
    shot: 'profile-hero-desktop',
    layoutClassName: 'xl:col-span-8 xl:row-span-2',
    kind: 'desktop',
  },
  {
    id: 'fan-capture',
    title: 'Capture every listener',
    body: 'A visit can become a listener Jovie can reach again.',
    accent: 'pink',
    scenarioId: 'tim-white-profile-subscribe-mobile',
    alt: 'Jovie artist profile subscribe surface for audience capture.',
    layoutClassName: 'xl:col-span-4 xl:row-span-2',
    kind: 'phone',
  },
  {
    id: 'audience-signal',
    title: 'Audience Signal',
    body: 'See where attention is building before you book or spend.',
    accent: 'blue',
    scenarioId: 'artist-spec-geo-insights-desktop',
    alt: 'Jovie geo insights showing cities where listener attention is building.',
    layoutClassName: 'xl:col-span-4',
    kind: 'desktop',
  },
  {
    id: 'tracked-routing',
    title: 'Tracked Routing',
    body: 'Share one destination and keep campaign routing attached.',
    accent: 'pink',
    scenarioId: 'artist-spec-tracked-links-desktop',
    alt: 'Jovie tracked-link controls for campaign routing.',
    layoutClassName: 'xl:col-span-4',
    kind: 'desktop',
  },
  {
    id: 'always-in-sync',
    title: 'Always in Sync',
    body: 'Profile surfaces stay current without rebuilding the link.',
    accent: 'blue',
    scenarioId: 'artist-spec-sync-settings-desktop',
    alt: 'Jovie sync settings that keep artist surfaces current.',
    layoutClassName: 'xl:col-span-4',
    kind: 'desktop',
  },
] as const;

export function getShippedSiteImage(scenarioId: string) {
  return getMarketingExportImage(scenarioId);
}
