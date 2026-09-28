import { getMarketingExportImage } from '@/lib/screenshots/registry';

export const HOMEPAGE_MEDIA_MAP_VERSION = 'homepage-media-map/jov-6118/v1';

const sharedReceipt = {
  owner: 'Jovie marketing / Tim White',
  subject: 'Tim White',
  rightsPrivacyApproval: 'founder-owned; approved for public marketing export',
  publicationState: 'current-public-export',
  placeholder: false,
  expiration: null,
  intendedCrop: {
    desktop: 'uncropped full mobile product surface',
    mobile: 'uncropped full mobile product surface',
  },
  loading: 'lazy',
  reducedMotionFallback: 'same static image; no motion required',
} as const;

export const HOMEPAGE_MEDIA_MAP = {
  connected: {
    chapter: 'connected',
    role: 'dominant-visual',
    sourceScenarioId: 'tim-white-profile-listen-mobile',
    sourceRoute: '/demo/showcase/tim-white-profile?mode=listen',
    asset: getMarketingExportImage('tim-white-profile-listen-mobile'),
    ...sharedReceipt,
  },
  relationships: {
    chapter: 'relationships',
    role: 'dominant-visual',
    sourceScenarioId: 'tim-white-profile-subscribe-mobile',
    sourceRoute: '/demo/showcase/tim-white-profile?mode=subscribe',
    asset: getMarketingExportImage('tim-white-profile-subscribe-mobile'),
    ...sharedReceipt,
  },
} as const;
