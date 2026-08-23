import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import type { MarketingFeatureTile } from '@/data/marketingFeatureTiles';
import { getMarketingExportImage } from '@/lib/screenshots/registry';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';

export const FRAMER_KIT_ACCENTS = ['blue', 'pink', 'purple'] as const;

export type FramerKitAccent = (typeof FRAMER_KIT_ACCENTS)[number];

export interface FramerKitShowcaseTile {
  readonly id: string;
  readonly title: string;
  readonly site: string;
  readonly scenarioId: string;
  readonly screenshotAlt: string;
  readonly href?: string;
}

export const FRAMER_KIT_COPY = {
  showcase: {
    headline: 'Live Artist Sites',
    body: 'Real Jovie profiles shipping music, dates, and support from one link.',
  },
  specBento: {
    headline: 'The Platform Under Every Profile',
    subhead:
      'Routing, audience, and release tools stay on the same dark stage as the live site.',
  } satisfies ArtistProfileLandingCopy['specWall'],
} as const;

export const FRAMER_KIT_SHOWCASE_TILES: readonly FramerKitShowcaseTile[] = [
  {
    id: 'tim-white-live',
    title: 'Tim White',
    site: TIM_WHITE_PROFILE.publicProfileDisplay,
    scenarioId: 'tim-white-profile-live-mobile',
    screenshotAlt: "Tim White's live Jovie artist profile.",
    href: TIM_WHITE_PROFILE.publicProfilePath,
  },
  {
    id: 'tim-white-listen',
    title: 'Listen Path',
    site: TIM_WHITE_PROFILE.publicProfileDisplay,
    scenarioId: 'tim-white-profile-listen-mobile',
    screenshotAlt:
      "Tim White's Jovie profile with the latest release ready to play.",
    href: TIM_WHITE_PROFILE.publicProfilePath,
  },
  {
    id: 'tim-white-tour',
    title: 'Tour Dates',
    site: TIM_WHITE_PROFILE.publicProfileDisplay,
    scenarioId: 'tim-white-profile-tour-mobile',
    screenshotAlt: "Tim White's Jovie profile showing upcoming tour dates.",
    href: TIM_WHITE_PROFILE.publicProfilePath,
  },
  {
    id: 'tim-white-alerts',
    title: 'Fan Alerts',
    site: TIM_WHITE_PROFILE.publicProfileDisplay,
    scenarioId: 'tim-white-profile-subscribe-mobile',
    screenshotAlt:
      "Tim White's Jovie profile subscribe surface for release alerts.",
    href: TIM_WHITE_PROFILE.publicProfilePath,
  },
  {
    id: 'tim-white-support',
    title: 'Direct Support',
    site: TIM_WHITE_PROFILE.publicProfileDisplay,
    scenarioId: 'tim-white-profile-pay-mobile',
    screenshotAlt: "Tim White's Jovie profile pay surface for direct support.",
    href: TIM_WHITE_PROFILE.publicProfilePath,
  },
  {
    id: 'deep-end-release',
    title: 'The Deep End',
    site: 'Release page',
    scenarioId: 'release-presave-mobile',
    screenshotAlt:
      'Jovie release page for The Deep End with a presave countdown.',
  },
] as const;

export const FRAMER_KIT_SPEC_TILES: readonly MarketingFeatureTile[] = [
  {
    id: 'release-workspace',
    title: 'Release Workspace',
    body: 'Keep the next drop, destinations, and follow-up in one dark stage.',
    size: 'large',
    accent: 'blue',
    layoutClassName:
      'xl:col-start-1 xl:row-start-1 xl:col-span-6 xl:row-span-2',
    visual: 'screenshot',
    screenshotSrc: getMarketingExportImage('dashboard-releases-sidebar-desktop')
      .publicUrl,
    screenshotAlt:
      'Jovie releases workspace with a selected release and detail rail.',
    objectPosition: 'center top',
  },
  {
    id: 'audience-cities',
    title: 'Audience Cities',
    body: 'See where attention is building before you book or spend.',
    size: 'large',
    accent: 'purple',
    layoutClassName:
      'xl:col-start-7 xl:row-start-1 xl:col-span-6 xl:row-span-2',
    visual: 'screenshot',
    screenshotSrc: getMarketingExportImage('artist-spec-geo-insights-desktop')
      .publicUrl,
    screenshotAlt: 'Jovie geo insights showing the top cities list.',
    objectPosition: 'center top',
  },
  {
    id: 'tracked-links',
    title: 'Tracked Links',
    body: 'Build share paths from the same flow the release already uses.',
    size: 'small',
    accent: 'pink',
    layoutClassName:
      'xl:col-start-1 xl:row-start-3 xl:col-span-4 xl:row-span-2',
    visual: 'screenshot',
    screenshotSrc: getMarketingExportImage('artist-spec-tracked-links-desktop')
      .publicUrl,
    screenshotAlt:
      'Jovie tracked-link share menu with campaign routing controls.',
    objectPosition: 'center top',
  },
  {
    id: 'live-sync',
    title: 'Live Sync',
    body: 'Profile surfaces stay current when the catalog moves.',
    size: 'small',
    accent: 'blue',
    layoutClassName:
      'xl:col-start-5 xl:row-start-3 xl:col-span-4 xl:row-span-2',
    visual: 'screenshot',
    screenshotSrc: getMarketingExportImage('artist-spec-sync-settings-desktop')
      .publicUrl,
    screenshotAlt: 'Jovie settings showing always-in-sync controls.',
    objectPosition: '50% 50%',
  },
  {
    id: 'fan-capture',
    title: 'Fan Capture',
    body: 'A visit can become a fan you can reach again.',
    size: 'small',
    accent: 'purple',
    layoutClassName:
      'xl:col-start-9 xl:row-start-3 xl:col-span-4 xl:row-span-2',
    visual: 'screenshot',
    screenshotSrc: getMarketingExportImage('tim-white-profile-subscribe-mobile')
      .publicUrl,
    screenshotAlt:
      'Jovie artist profile showing the subscribe surface for fan capture.',
    objectPosition: 'center top',
  },
] as const;
