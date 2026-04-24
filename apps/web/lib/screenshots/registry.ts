import { ARTIST_PROFILE_SECTION_SCREENSHOT_ORDER } from '@/data/artistProfilePageOrder';
import { getCanonicalSurfaceForScreenshotId } from '@/lib/canonical-surfaces';
import type {
  ScreenshotConsumer,
  ScreenshotGroup,
  ScreenshotScenario,
} from './types';

export const SCREENSHOT_VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
} as const;

export const GROUP_LABELS: Record<ScreenshotGroup, string> = {
  marketing: 'Marketing',
  onboarding: 'Onboarding',
  dashboard: 'Dashboard',
  settings: 'Settings',
  'public-profile': 'Public Profile',
};

const ADMIN_ONLY = ['admin'] as const satisfies readonly ScreenshotConsumer[];
const ADMIN_AND_INVESTOR = [
  'admin',
  'investor-ready',
] as const satisfies readonly ScreenshotConsumer[];
const ADMIN_MARKETING_AND_INVESTOR = [
  'admin',
  'marketing-export',
  'investor-ready',
] as const satisfies readonly ScreenshotConsumer[];

const ARTIST_PROFILE_SECTION_SCREENSHOT_SCENARIOS =
  ARTIST_PROFILE_SECTION_SCREENSHOT_ORDER.map(section => {
    const selector = `[data-testid="${section.testId}"]`;

    return {
      id: section.screenshotScenarioId,
      title: `Artist Profile ${section.label} Section`,
      route: '/artist-profiles',
      waitFor: selector,
      captureTarget: 'locator' as const,
      captureSelector: selector,
      reducedMotion:
        section.screenshotScenarioId ===
        'artist-profile-capture-section-desktop',
    };
  });

interface ScreenshotScenarioInput
  extends Omit<
    ScreenshotScenario,
    'fullPage' | 'groupLabel' | 'theme' | 'viewport'
  > {
  readonly fullPage?: boolean;
  readonly theme?: ScreenshotScenario['theme'];
  readonly viewport?: ScreenshotScenario['viewport'];
}

type ScreenshotScenarioSeed = Omit<
  ScreenshotScenarioInput,
  'consumers' | 'group'
>;

function defineScenario({
  fullPage = false,
  theme = 'dark',
  viewport = 'desktop',
  ...scenario
}: ScreenshotScenarioInput): ScreenshotScenario {
  const canonicalSurface = getCanonicalSurfaceForScreenshotId(scenario.id);

  return {
    ...scenario,
    groupLabel: GROUP_LABELS[scenario.group],
    canonicalSurfaceId: canonicalSurface?.id,
    canonicalSurfaceLabel: canonicalSurface?.label,
    canonicalSurfaceReviewRoute: canonicalSurface?.reviewRoute,
    viewport,
    theme,
    fullPage,
  };
}

function defineScenarios(
  group: ScreenshotGroup,
  consumers: readonly ScreenshotConsumer[],
  scenarios: readonly ScreenshotScenarioSeed[]
): readonly ScreenshotScenario[] {
  return scenarios.map(scenario =>
    defineScenario({
      ...scenario,
      group,
      consumers,
    })
  );
}

export const SCREENSHOT_SCENARIOS: readonly ScreenshotScenario[] = [
  ...defineScenarios('marketing', ADMIN_AND_INVESTOR, [
    {
      id: 'marketing-home-desktop',
      title: 'Homepage',
      route: '/',
      waitFor: 'main',
    },
    {
      id: 'release-landing-desktop',
      title: 'Release Landing Page',
      route: '/demo/showcase/release-landing',
      waitFor: '[data-testid="demo-showcase-release-landing"]',
      captureTarget: 'locator',
      captureSelector: '[data-testid="demo-showcase-release-landing"]',
      publicExportPath: 'release-landing-desktop.png',
    },
    {
      id: 'release-tasks-desktop',
      title: 'Release Tasks',
      route: '/demo/showcase/release-tasks',
      waitFor: '[data-testid="demo-showcase-release-tasks"]',
      captureTarget: 'locator',
      captureSelector: '[data-testid="demo-showcase-release-tasks"]',
      publicExportPath: 'release-tasks-active.png',
    },
    {
      id: 'release-presave-mobile',
      title: 'Release Presave Mobile',
      route: '/demo/showcase/release-presave',
      waitFor: '[data-testid="demo-showcase-release-presave"]',
      viewport: 'mobile',
      publicExportPath: 'release-deep-end-phone.png',
    },
    {
      id: 'release-landing-mobile',
      title: 'Release Landing Mobile',
      route: '/demo/showcase/release-landing',
      waitFor: '[data-testid="demo-showcase-release-landing"]',
      viewport: 'mobile',
      publicExportPath: 'release-take-me-over-phone.png',
    },
    {
      id: 'artist-spec-audience-quality-desktop',
      title: 'Artist Spec — Audience Quality',
      route: '/demo/showcase/settings?capture=quality',
      waitFor: '[data-testid="demo-settings-audience-quality-capture"]',
      captureTarget: 'locator',
      captureSelector: '[data-testid="demo-settings-audience-quality-capture"]',
      publicExportPath: 'artist-spec-audience-quality-desktop.png',
    },
    {
      id: 'artist-spec-opinionated-design-mobile',
      title: 'Artist Spec — Opinionated Design',
      route: '/demo/showcase/tim-white-profile',
      waitFor: '[data-testid="profile-compact-shell"]',
      captureTarget: 'locator',
      captureSelector: '[data-testid="profile-compact-shell"]',
      viewport: 'mobile',
      publicExportPath: 'artist-spec-opinionated-design-mobile.png',
    },
    {
      id: 'artist-spec-creator-menu-mobile',
      title: 'Artist Spec — Creator Activation',
      route: '/demo/showcase/release-landing?capture=creator-menu',
      waitFor: '[data-testid="demo-release-creator-capture"]',
      captureTarget: 'locator',
      captureSelector: '[data-testid="demo-release-creator-capture"]',
      viewport: 'mobile',
      publicExportPath: 'artist-spec-creator-menu-mobile.png',
    },
    {
      id: 'artist-spec-geo-insights-desktop',
      title: 'Artist Spec — Geo Insights',
      route: '/demo/audience?capture=geo',
      waitFor: '[data-testid="demo-audience-capture-geo"]',
      captureTarget: 'locator',
      captureSelector: '[data-testid="demo-audience-capture-geo"]',
      publicExportPath: 'artist-spec-geo-insights-desktop.png',
    },
    {
      id: 'artist-spec-sync-settings-desktop',
      title: 'Artist Spec — Sync Settings',
      route: '/demo/showcase/settings?capture=sync',
      waitFor: '[data-testid="demo-settings-sync-capture"]',
      captureTarget: 'locator',
      captureSelector: '[data-testid="demo-settings-sync-capture"]',
      publicExportPath: 'artist-spec-sync-settings-desktop.png',
    },
    {
      id: 'artist-spec-press-assets-mobile',
      title: 'Artist Spec — Press Assets',
      route: '/demo/showcase/tim-white-profile?mode=about&capture=press-assets',
      waitFor: '[data-testid="demo-press-assets-capture"]',
      captureTarget: 'locator',
      captureSelector: '[data-testid="demo-press-assets-capture"]',
      viewport: 'mobile',
      publicExportPath: 'artist-spec-press-assets-mobile.png',
    },
    {
      id: 'artist-spec-tracked-links-desktop',
      title: 'Artist Spec — UTM Builder',
      route: '/demo/showcase/release-tracked-links',
      waitFor: '[data-testid="demo-release-tracked-links-capture"]',
      captureTarget: 'locator',
      captureSelector: '[data-testid="demo-release-tracked-links-capture"]',
      publicExportPath: 'artist-spec-tracked-links-desktop.png',
    },
    ...ARTIST_PROFILE_SECTION_SCREENSHOT_SCENARIOS,
    {
      id: 'tim-white-profile-mock-home-mobile',
      title: 'Tim White Profile — Mock Home',
      route: '/demo/showcase/tim-white-profile?state=mock-home',
      waitFor: '[data-testid="demo-showcase-tim-white-profile-state"]',
      captureTarget: 'locator',
      captureSelector: '[data-testid="homepage-phone-state-mock-home"]',
      viewport: 'mobile',
    },
    {
      id: 'tim-white-profile-tour-mobile',
      title: 'Tim White Profile — Tour',
      route: '/demo/showcase/tim-white-profile?mode=tour',
      waitFor: '[data-testid="demo-showcase-tim-white-profile"]',
      viewport: 'mobile',
      publicExportPath: 'tim-white-profile-tour-phone.png',
    },
    {
      id: 'tim-white-profile-tour-nearby-mobile',
      title: 'Tim White Profile — Nearby Tour',
      route: '/demo/showcase/tim-white-profile?state=tour-nearby',
      waitFor: '[data-testid="demo-showcase-tim-white-profile-state"]',
      viewport: 'mobile',
    },
    {
      id: 'tim-white-profile-pay-mobile',
      title: 'Tim White Profile — Pay',
      route: '/demo/showcase/tim-white-profile?mode=pay',
      waitFor: '[data-testid="demo-showcase-tim-white-profile"]',
      viewport: 'mobile',
      publicExportPath: 'tim-white-profile-pay-phone.png',
    },
    {
      id: 'tim-white-profile-presave-mobile',
      title: 'Tim White Profile — Presave Countdown',
      route: '/demo/showcase/tim-white-profile?release=presave',
      waitFor: '[data-testid="demo-showcase-tim-white-profile"]',
      viewport: 'mobile',
      publicExportPath: 'tim-white-profile-presave-phone.png',
      fixedNow: '2026-04-15T12:00:00.000Z',
    },
    {
      id: 'tim-white-profile-live-mobile',
      title: 'Tim White Profile — Latest Release',
      route: '/demo/showcase/tim-white-profile?release=live',
      waitFor: '[data-testid="demo-showcase-tim-white-profile"]',
      viewport: 'mobile',
      publicExportPath: 'tim-white-profile-live-phone.png',
    },
    {
      id: 'tim-white-profile-video-mobile',
      title: 'Tim White Profile — Music Video',
      route: '/demo/showcase/tim-white-profile?release=video',
      waitFor: '[data-testid="demo-showcase-tim-white-profile"]',
      viewport: 'mobile',
      publicExportPath: 'tim-white-profile-video-phone.png',
    },
    {
      id: 'tim-white-profile-subscribe-mobile',
      title: 'Tim White Profile — Subscribe',
      route: '/demo/showcase/tim-white-profile?mode=subscribe',
      waitFor: '[data-testid="demo-showcase-tim-white-profile"]',
      viewport: 'mobile',
      publicExportPath: 'tim-white-profile-subscribe-phone.png',
    },
    {
      id: 'tim-white-profile-contact-mobile',
      title: 'Tim White Profile — Contact',
      route: '/demo/showcase/tim-white-profile?mode=contact',
      waitFor: '[data-testid="demo-showcase-tim-white-profile"]',
      viewport: 'mobile',
      publicExportPath: 'tim-white-profile-contact-phone.png',
    },
    {
      id: 'tim-white-profile-listen-mobile',
      title: 'Tim White Profile — Listen',
      route: '/demo/showcase/tim-white-profile?mode=listen',
      waitFor: '[data-testid="demo-showcase-tim-white-profile"]',
      viewport: 'mobile',
      publicExportPath: 'tim-white-profile-listen-phone.png',
    },
    {
      id: 'tim-white-profile-playlist-fallback-mobile',
      title: 'Tim White Profile — Playlist Fallback',
      route: '/demo/showcase/tim-white-profile?state=playlist-fallback',
      waitFor: '[data-testid="demo-showcase-tim-white-profile-state"]',
      viewport: 'mobile',
    },
    {
      id: 'tim-white-profile-listen-fallback-mobile',
      title: 'Tim White Profile — Listen Fallback',
      route: '/demo/showcase/tim-white-profile?state=listen-fallback',
      waitFor: '[data-testid="demo-showcase-tim-white-profile-state"]',
      viewport: 'mobile',
    },
  ]),
  ...defineScenarios('dashboard', ADMIN_MARKETING_AND_INVESTOR, [
    {
      id: 'dashboard-releases-desktop',
      title: 'Releases Dashboard',
      route: '/demo',
      waitFor: '[data-testid="releases-matrix"]',
      publicExportPath: 'releases-dashboard-full.png',
    },
    {
      id: 'dashboard-releases-sidebar-desktop',
      title: 'Releases With Sidebar',
      route: '/demo',
      waitFor: '[data-testid="release-sidebar"]',
      interaction: 'open-first-release',
      publicExportPath: 'releases-dashboard-sidebar.png',
    },
    {
      id: 'dashboard-release-sidebar-detail-desktop',
      title: 'Release Sidebar Detail',
      route: '/demo',
      waitFor: '[data-testid="release-sidebar"]',
      captureTarget: 'locator',
      captureSelector: '[data-testid="release-sidebar"]',
      interaction: 'open-first-release',
      publicExportPath: 'release-sidebar-detail.png',
    },
    {
      id: 'dashboard-release-sidebar-platforms-desktop',
      title: 'Release Sidebar Platforms',
      route: '/demo',
      waitFor: '[data-testid="release-tabbed-card"]',
      captureTarget: 'locator',
      captureSelector: '[data-testid="release-tabbed-card"]',
      interaction: 'open-first-release-dsps',
      publicExportPath: 'release-sidebar-platforms.png',
    },
    {
      id: 'dashboard-audience-desktop',
      title: 'Audience CRM',
      route: '/demo/audience',
      waitFor: 'table, [role="grid"], [data-testid="unified-table"]',
      publicExportPath: 'audience-crm.png',
    },
  ]),
  ...defineScenarios('dashboard', ADMIN_AND_INVESTOR, [
    {
      id: 'dashboard-analytics-desktop',
      title: 'Analytics Overview',
      route: '/demo/showcase/analytics',
      waitFor: '[data-testid="demo-showcase-analytics"]',
    },
    {
      id: 'dashboard-earnings-desktop',
      title: 'Earnings Overview',
      route: '/demo/showcase/earnings',
      waitFor: '[data-testid="demo-showcase-earnings"]',
    },
  ]),
  ...defineScenarios('settings', ADMIN_ONLY, [
    {
      id: 'settings-profile-desktop',
      title: 'Artist Profile Settings',
      route: '/demo/showcase/settings',
      waitFor: '[data-testid="demo-showcase-settings"]',
    },
  ]),
  ...defineScenarios('settings', ADMIN_AND_INVESTOR, [
    {
      id: 'settings-links-desktop',
      title: 'Links Manager',
      route: '/demo/showcase/links',
      waitFor: '[data-testid="demo-showcase-links"]',
    },
  ]),
  ...defineScenarios('onboarding', ADMIN_AND_INVESTOR, [
    {
      id: 'onboarding-handle-desktop',
      title: 'Onboarding Handle Step',
      route: '/demo/showcase/onboarding-handle',
      waitFor: '#handle-input',
    },
    {
      id: 'onboarding-dsp-desktop',
      title: 'Onboarding DSP Step',
      route: '/demo/showcase/onboarding-dsp',
      waitFor: '[data-testid="spotify-link-input"]',
    },
    {
      id: 'onboarding-profile-review-desktop',
      title: 'Onboarding Profile Review',
      route: '/demo/showcase/onboarding-profile-review',
      waitFor: 'text=Continue to Dashboard',
    },
  ]),
  ...defineScenarios('public-profile', ADMIN_MARKETING_AND_INVESTOR, [
    {
      id: 'public-profile-desktop',
      title: 'Public Profile',
      route: '/demo/showcase/public-profile',
      waitFor: '[data-testid="demo-showcase-public-profile"]',
      publicExportPath: 'profile-desktop.png',
    },
    {
      id: 'public-profile-mobile',
      title: 'Public Profile Mobile',
      route: '/demo/showcase/public-profile',
      waitFor: '[data-testid="demo-showcase-public-profile"]',
      viewport: 'mobile',
      publicExportPath: 'profile-phone.png',
    },
  ]),
] as const;

export const SCREENSHOT_SCENARIO_IDS = new Set(
  SCREENSHOT_SCENARIOS.map(scenario => scenario.id)
);

export function getScreenshotScenario(id: string): ScreenshotScenario | null {
  return SCREENSHOT_SCENARIOS.find(scenario => scenario.id === id) ?? null;
}
