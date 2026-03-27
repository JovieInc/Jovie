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
  return {
    ...scenario,
    groupLabel: GROUP_LABELS[scenario.group],
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
      waitFor: 'input[placeholder*="Spotify link"]',
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
      route: '/e2e-test-user',
      waitFor: '[data-testid="profile-header"], h1, main img[alt]:visible',
      publicExportPath: 'profile-desktop.png',
    },
    {
      id: 'public-profile-mobile',
      title: 'Public Profile Mobile',
      route: '/e2e-test-user',
      waitFor: '[data-testid="profile-header"], h1, main img[alt]:visible',
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
