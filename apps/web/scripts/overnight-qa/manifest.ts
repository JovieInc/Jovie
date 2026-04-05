import { ADMIN_RENDER_SURFACES } from '../../tests/e2e/utils/admin-surface-manifest';
import { DASHBOARD_ROUTE_MATRIX } from '../../tests/e2e/utils/dashboard-route-matrix';
import type { OvernightIssueSurface, OvernightSuiteDefinition } from './types';

export const MAX_OVERNIGHT_MERGED_FIXES = 5;
export const MAX_CONSECUTIVE_CI_FAILURES = 2;
export const MAX_CONSECUTIVE_UNFIXABLE_ISSUES = 3;

export function buildSweepManifest(
  baseUrl: string
): readonly OvernightSuiteDefinition[] {
  const playwrightBaseEnv = {
    BASE_URL: baseUrl,
    E2E_SKIP_WEB_SERVER: '1',
    E2E_USE_TEST_AUTH_BYPASS: '1',
    E2E_FAST_ONBOARDING: '1',
    NEXT_PUBLIC_CLERK_MOCK: '1',
    NEXT_PUBLIC_CLERK_PROXY_DISABLED: '1',
    E2E_TEST_AUTH_PERSONA: 'creator',
  } satisfies Record<string, string>;

  return [
    {
      id: 'breadth-route-qa',
      label: 'Breadth Route QA',
      kind: 'route-qa',
      priority: 10,
      command: ['pnpm', 'run', 'qa:routes'],
      env: {
        ROUTE_QA_BASE_URL: baseUrl,
        ROUTE_QA_OUTPUT_DIR: 'overnight-route-qa',
      },
      failureSurface: 'unknown',
    },
    {
      id: 'smoke-public',
      label: 'Public Smoke',
      kind: 'playwright',
      priority: 20,
      command: [
        'pnpm',
        'exec',
        'playwright',
        'test',
        'tests/e2e/smoke-public.spec.ts',
        '--config=playwright.config.ts',
        '--project=chromium',
        '--reporter=json',
      ],
      env: playwrightBaseEnv,
      reportFileName: 'smoke-public.json',
      failureSurface: 'marketing',
    },
    {
      id: 'smoke-auth',
      label: 'Authenticated Smoke',
      kind: 'playwright',
      priority: 30,
      command: [
        'pnpm',
        'exec',
        'playwright',
        'test',
        'tests/e2e/smoke-auth.spec.ts',
        '--config=playwright.config.ts',
        '--project=chromium',
        '--reporter=json',
      ],
      env: { ...playwrightBaseEnv, E2E_TEST_AUTH_PERSONA: 'creator' },
      reportFileName: 'smoke-auth.json',
      failureSurface: 'auth',
    },
    {
      id: 'golden-path',
      label: 'Golden Path',
      kind: 'playwright',
      priority: 40,
      command: [
        'pnpm',
        'exec',
        'playwright',
        'test',
        'tests/e2e/golden-path.spec.ts',
        '--config=playwright.config.ts',
        '--project=chromium',
        '--reporter=json',
      ],
      env: { ...playwrightBaseEnv, E2E_TEST_AUTH_PERSONA: 'creator' },
      reportFileName: 'golden-path.json',
      failureSurface: 'creator',
    },
    {
      id: 'content-gate',
      label: 'Content Gate',
      kind: 'playwright',
      priority: 50,
      command: [
        'pnpm',
        'exec',
        'playwright',
        'test',
        'tests/e2e/content-gate.spec.ts',
        '--config=playwright.config.ts',
        '--project=chromium',
        '--reporter=json',
      ],
      env: playwrightBaseEnv,
      reportFileName: 'content-gate.json',
      failureSurface: 'marketing',
    },
    {
      id: 'dashboard-health',
      label: 'Dashboard Health',
      kind: 'playwright',
      priority: 60,
      command: [
        'pnpm',
        'exec',
        'playwright',
        'test',
        'tests/e2e/dashboard-pages-health.spec.ts',
        '--config=playwright.config.nightly.ts',
        '--project=chromium',
        '--reporter=json',
      ],
      env: { ...playwrightBaseEnv, E2E_TEST_AUTH_PERSONA: 'creator' },
      reportFileName: 'dashboard-health.json',
      failureSurface: 'creator',
    },
    {
      id: 'chaos-authenticated',
      label: 'Authenticated Chaos',
      kind: 'playwright',
      priority: 70,
      command: [
        'pnpm',
        'exec',
        'playwright',
        'test',
        'tests/e2e/chaos-authenticated.spec.ts',
        '--config=playwright.config.ts',
        '--project=chromium',
        '--reporter=json',
      ],
      env: { ...playwrightBaseEnv, E2E_TEST_AUTH_PERSONA: 'creator' },
      reportFileName: 'chaos-authenticated.json',
      failureSurface: 'creator',
    },
    {
      id: 'releases-chaos',
      label: 'Releases Chaos',
      kind: 'playwright',
      priority: 80,
      command: [
        'pnpm',
        'exec',
        'playwright',
        'test',
        'tests/e2e/releases-dashboard.chaos.spec.ts',
        '--config=playwright.config.ts',
        '--project=chromium',
        '--reporter=json',
      ],
      env: { ...playwrightBaseEnv, E2E_TEST_AUTH_PERSONA: 'creator' },
      reportFileName: 'releases-chaos.json',
      failureSurface: 'creator',
    },
    {
      id: 'full-surface-chaos',
      label: 'Full Surface Chaos',
      kind: 'playwright',
      priority: 90,
      command: [
        'pnpm',
        'exec',
        'playwright',
        'test',
        'tests/e2e/nightly/full-surface-chaos.spec.ts',
        '--config=playwright.config.nightly.ts',
        '--project=chromium',
        '--reporter=json',
      ],
      env: { ...playwrightBaseEnv, E2E_TEST_AUTH_PERSONA: 'creator' },
      reportFileName: 'full-surface-chaos.json',
      failureSurface: 'settings',
    },
    {
      id: 'auth-flows-nightly',
      label: 'Nightly Auth Flows',
      kind: 'playwright',
      priority: 100,
      command: [
        'pnpm',
        'exec',
        'playwright',
        'test',
        'tests/e2e/nightly/auth-flows.spec.ts',
        '--config=playwright.config.nightly.ts',
        '--project=chromium',
        '--reporter=json',
      ],
      env: { ...playwrightBaseEnv, E2E_TEST_AUTH_PERSONA: 'creator' },
      reportFileName: 'auth-flows-nightly.json',
      failureSurface: 'auth',
    },
    {
      id: 'onboarding-nightly',
      label: 'Nightly Onboarding',
      kind: 'playwright',
      priority: 110,
      command: [
        'pnpm',
        'exec',
        'playwright',
        'test',
        'tests/e2e/nightly/onboarding-flow.spec.ts',
        '--config=playwright.config.nightly.ts',
        '--project=chromium',
        '--reporter=json',
      ],
      env: { ...playwrightBaseEnv, E2E_TEST_AUTH_PERSONA: 'creator' },
      reportFileName: 'onboarding-nightly.json',
      failureSurface: 'onboarding',
    },
  ];
}

export function buildSurfaceInventory() {
  return {
    creatorRoutes: DASHBOARD_ROUTE_MATRIX.dashboard.full.length,
    settingsRoutes: DASHBOARD_ROUTE_MATRIX.settings.full.length,
    aliasRoutes: DASHBOARD_ROUTE_MATRIX.alias.full.length,
    adminRoutes: DASHBOARD_ROUTE_MATRIX.admin.full.length,
    adminRenderSurfaces: ADMIN_RENDER_SURFACES.length,
  };
}

const SURFACE_PRIORITY: Readonly<Record<OvernightIssueSurface, number>> = {
  billing: 10,
  onboarding: 20,
  auth: 30,
  admin: 40,
  settings: 50,
  creator: 60,
  'public-profile': 70,
  marketing: 80,
  legal: 90,
  alias: 100,
  api: 110,
  unknown: 120,
};

export function surfacePriority(surface: OvernightIssueSurface) {
  return SURFACE_PRIORITY[surface];
}

export function inferSurfaceFromText(
  text: string,
  fallback: OvernightIssueSurface = 'unknown'
): OvernightIssueSurface {
  const lowerText = text.toLowerCase();

  if (
    lowerText.includes('billing') ||
    lowerText.includes('/api/stripe') ||
    lowerText.includes('/api/billing')
  ) {
    return 'billing';
  }

  if (lowerText.includes('onboarding')) {
    return 'onboarding';
  }

  if (lowerText.includes('admin')) {
    return 'admin';
  }

  if (lowerText.includes('settings')) {
    return 'settings';
  }

  if (lowerText.includes('auth') || lowerText.includes('signin')) {
    return 'auth';
  }

  if (
    lowerText.includes('profile') ||
    lowerText.includes('/tim') ||
    lowerText.includes('/[username]')
  ) {
    return 'public-profile';
  }

  if (lowerText.includes('pricing') || lowerText.includes('homepage')) {
    return 'marketing';
  }

  return fallback;
}
