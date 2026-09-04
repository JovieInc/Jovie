import { getMarketingExportImage } from '@/lib/screenshots/registry';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';

export type JovieMarketingAccent = 'blue' | 'pink' | 'purple';

export interface ShippedSiteTile {
  readonly id: string;
  readonly name: string;
  readonly handle: string;
  readonly href?: string;
  readonly label: string;
  readonly scenarioId: string;
  readonly alt: string;
  readonly kind: 'phone' | 'desktop';
}

export interface PlatformSpecTile {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly accent: JovieMarketingAccent;
  readonly scenarioId: string;
  readonly alt: string;
  readonly layoutClassName: string;
  readonly kind: 'phone' | 'desktop';
}

const LIVE_PROFILE_HREF = TIM_WHITE_PROFILE.publicProfilePath;

export const SHIPPED_SITES_SHOWCASE_COPY = {
  headline: 'All your music, working while you sleep.',
  body: 'One connected system for releases, links, discovery, audience capture, and updates.',
} as const;

export const PLATFORM_SPEC_BENTO_COPY = {
  headline: 'The Artist Platform',
  body: 'Profiles, capture, routing, and audience signal. Dark product surfaces, Jovie accents only.',
} as const;

export const SHIPPED_SITE_TILES: readonly ShippedSiteTile[] = [
  {
    id: 'live-release',
    name: TIM_WHITE_PROFILE.name,
    handle: TIM_WHITE_PROFILE.publicProfileDisplay,
    href: LIVE_PROFILE_HREF,
    label: 'Latest Release',
    scenarioId: 'tim-white-profile-live-mobile',
    alt: "Tim White's live Jovie artist profile with the current release first.",
    kind: 'phone',
  },
  {
    id: 'audience-insight',
    name: 'Audience',
    handle: 'City signal',
    label: 'Audience Insight',
    scenarioId: 'artist-spec-geo-insights-desktop',
    alt: 'Jovie geo insights showing cities where fan attention is building.',
    kind: 'desktop',
  },
  {
    id: 'pay',
    name: TIM_WHITE_PROFILE.name,
    handle: TIM_WHITE_PROFILE.publicProfileDisplay,
    href: LIVE_PROFILE_HREF,
    label: 'Direct Support',
    scenarioId: 'tim-white-profile-pay-mobile',
    alt: "Tim White's Jovie artist profile with native support options.",
    kind: 'phone',
  },
  {
    id: 'subscribe',
    name: TIM_WHITE_PROFILE.name,
    handle: TIM_WHITE_PROFILE.publicProfileDisplay,
    href: LIVE_PROFILE_HREF,
    label: 'Fan Capture',
    scenarioId: 'tim-white-profile-subscribe-mobile',
    alt: "Tim White's Jovie artist profile collecting release alerts.",
    kind: 'phone',
  },
  {
    id: 'tracked-routing',
    name: 'Campaign Links',
    handle: 'Attribution kept',
    label: 'Tracked Routing',
    scenarioId: 'artist-spec-tracked-links-desktop',
    alt: 'Jovie tracked-link controls for campaign routing.',
    kind: 'desktop',
  },
  {
    id: 'public-desktop',
    name: TIM_WHITE_PROFILE.name,
    handle: TIM_WHITE_PROFILE.publicProfileDisplay,
    href: LIVE_PROFILE_HREF,
    label: 'Desktop Site',
    scenarioId: 'public-profile-desktop',
    alt: "Tim White's public Jovie artist site on desktop.",
    kind: 'desktop',
  },
  {
    id: 'deep-end-release',
    name: 'The Deep End',
    handle: 'Release page',
    label: 'Presave',
    scenarioId: 'release-presave-mobile',
    alt: 'Jovie release page for The Deep End with a presave countdown.',
    kind: 'phone',
  },
] as const;

export const PLATFORM_SPEC_TILES: readonly PlatformSpecTile[] = [
  {
    id: 'adaptive-profile',
    title: 'One Adaptive Profile',
    body: 'The same artist site puts the right action first as the release moment changes.',
    accent: 'purple',
    scenarioId: 'public-profile-desktop',
    alt: 'Jovie public artist profile on desktop with the live release in view.',
    layoutClassName: 'xl:col-span-8 xl:row-span-2',
    kind: 'desktop',
  },
  {
    id: 'fan-capture',
    title: 'Capture Every Fan',
    body: 'A visit can become a fan Jovie can reach again.',
    accent: 'pink',
    scenarioId: 'tim-white-profile-subscribe-mobile',
    alt: 'Jovie artist profile subscribe surface for fan capture.',
    layoutClassName: 'xl:col-span-4 xl:row-span-2',
    kind: 'phone',
  },
  {
    id: 'audience-signal',
    title: 'Audience Signal',
    body: 'See where attention is building before you book or spend.',
    accent: 'blue',
    scenarioId: 'artist-spec-geo-insights-desktop',
    alt: 'Jovie geo insights showing cities where fan attention is building.',
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
