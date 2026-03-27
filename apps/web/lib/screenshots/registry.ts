import type {
  ScreenshotConsumer,
  ScreenshotGroup,
  ScreenshotScenario,
} from './types';

export const SCREENSHOT_VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
} as const;

const GROUP_LABELS: Record<ScreenshotGroup, string> = {
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

interface ScreenshotScenarioInput
  extends Omit<
    ScreenshotScenario,
    'fullPage' | 'groupLabel' | 'theme' | 'viewport'
  > {
  readonly fullPage?: boolean;
  readonly theme?: ScreenshotScenario['theme'];
  readonly viewport?: ScreenshotScenario['viewport'];
}

function defineScenario({
  fullPage = false,
  theme = 'dark',
  viewport = 'desktop',
  ...scenario
}: ScreenshotScenarioInput): ScreenshotScenario {
  return {
    ...scenario,
    groupLabel: GROUP_LABELS[scenario.group],
    viewport,
    theme,
    fullPage,
  };
}

export const SCREENSHOT_SCENARIOS: readonly ScreenshotScenario[] = [
  defineScenario({
    id: 'marketing-home-desktop',
    title: 'Homepage',
    group: 'marketing',
    route: '/',
    waitFor: 'main',
    consumers: ADMIN_AND_INVESTOR,
  }),
  defineScenario({
    id: 'dashboard-releases-desktop',
    title: 'Releases Dashboard',
    group: 'dashboard',
    route: '/demo',
    waitFor: '[data-testid="releases-matrix"]',
    consumers: ADMIN_MARKETING_AND_INVESTOR,
    publicExportPath: 'releases-dashboard-full.png',
  }),
  defineScenario({
    id: 'dashboard-releases-sidebar-desktop',
    title: 'Releases With Sidebar',
    group: 'dashboard',
    route: '/demo',
    waitFor: '[data-testid="release-sidebar"]',
    consumers: ADMIN_MARKETING_AND_INVESTOR,
    interaction: 'open-first-release',
    publicExportPath: 'releases-dashboard-sidebar.png',
  }),
  defineScenario({
    id: 'dashboard-release-sidebar-detail-desktop',
    title: 'Release Sidebar Detail',
    group: 'dashboard',
    route: '/demo',
    waitFor: '[data-testid="release-sidebar"]',
    consumers: ADMIN_MARKETING_AND_INVESTOR,
    captureTarget: 'locator',
    captureSelector: '[data-testid="release-sidebar"]',
    interaction: 'open-first-release',
    publicExportPath: 'release-sidebar-detail.png',
  }),
  defineScenario({
    id: 'dashboard-audience-desktop',
    title: 'Audience CRM',
    group: 'dashboard',
    route: '/demo/audience',
    waitFor: 'table, [role="grid"], [data-testid="unified-table"]',
    consumers: ADMIN_MARKETING_AND_INVESTOR,
    publicExportPath: 'audience-crm.png',
  }),
  defineScenario({
    id: 'dashboard-analytics-desktop',
    title: 'Analytics Overview',
    group: 'dashboard',
    route: '/demo/showcase/analytics',
    waitFor: '[data-testid="demo-showcase-analytics"]',
    consumers: ADMIN_AND_INVESTOR,
  }),
  defineScenario({
    id: 'dashboard-earnings-desktop',
    title: 'Earnings Overview',
    group: 'dashboard',
    route: '/demo/showcase/earnings',
    waitFor: '[data-testid="demo-showcase-earnings"]',
    consumers: ADMIN_AND_INVESTOR,
  }),
  defineScenario({
    id: 'settings-profile-desktop',
    title: 'Artist Profile Settings',
    group: 'settings',
    route: '/demo/showcase/settings',
    waitFor: '[data-testid="demo-showcase-settings"]',
    consumers: ADMIN_ONLY,
  }),
  defineScenario({
    id: 'settings-links-desktop',
    title: 'Links Manager',
    group: 'settings',
    route: '/demo/showcase/links',
    waitFor: '[data-testid="demo-showcase-links"]',
    consumers: ADMIN_AND_INVESTOR,
  }),
  defineScenario({
    id: 'onboarding-handle-desktop',
    title: 'Onboarding Handle Step',
    group: 'onboarding',
    route: '/demo/showcase/onboarding-handle',
    waitFor: '#handle-input',
    consumers: ADMIN_AND_INVESTOR,
  }),
  defineScenario({
    id: 'onboarding-dsp-desktop',
    title: 'Onboarding DSP Step',
    group: 'onboarding',
    route: '/demo/showcase/onboarding-dsp',
    waitFor: 'input[placeholder*="Spotify link"]',
    consumers: ADMIN_AND_INVESTOR,
  }),
  defineScenario({
    id: 'onboarding-profile-review-desktop',
    title: 'Onboarding Profile Review',
    group: 'onboarding',
    route: '/demo/showcase/onboarding-profile-review',
    waitFor: 'text=Continue to Dashboard',
    consumers: ADMIN_AND_INVESTOR,
  }),
  defineScenario({
    id: 'public-profile-desktop',
    title: 'Public Profile',
    group: 'public-profile',
    route: '/e2e-test-user',
    waitFor: '[data-testid="profile-header"], h1, main img[alt]:visible',
    consumers: ADMIN_MARKETING_AND_INVESTOR,
    publicExportPath: 'profile-desktop.png',
  }),
  defineScenario({
    id: 'public-profile-mobile',
    title: 'Public Profile Mobile',
    group: 'public-profile',
    route: '/e2e-test-user',
    waitFor: '[data-testid="profile-header"], h1, main img[alt]:visible',
    viewport: 'mobile',
    consumers: ADMIN_MARKETING_AND_INVESTOR,
    publicExportPath: 'profile-phone.png',
  }),
] as const;

export const SCREENSHOT_SCENARIO_IDS = new Set(
  SCREENSHOT_SCENARIOS.map(scenario => scenario.id)
);

export function getScreenshotScenario(id: string): ScreenshotScenario | null {
  return SCREENSHOT_SCENARIOS.find(scenario => scenario.id === id) ?? null;
}
