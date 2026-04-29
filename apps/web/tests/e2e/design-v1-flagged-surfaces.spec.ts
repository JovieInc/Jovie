/**
 * Focused Design V1 flag matrix.
 *
 * Verifies every Design V1 runtime app flag remains default-off, preserves the
 * default route behavior with no override, and renders its gated surface when
 * forced on through the same browser override harness used by local QA.
 *
 * Run:
 *   doppler run --project jovie-web --config dev -- env E2E_USE_TEST_AUTH_BYPASS=1 pnpm --filter @jovie/web exec playwright test tests/e2e/design-v1-flagged-surfaces.spec.ts --project=chromium
 */

import {
  type APIRequestContext,
  expect,
  type Page,
  test,
} from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import type { DevTestAuthPersona } from '@/lib/auth/dev-test-auth-types';
import {
  TEST_AUTH_BYPASS_MODE,
  TEST_MODE_COOKIE,
  TEST_PERSONA_COOKIE,
  TEST_USER_ID_COOKIE,
} from '@/lib/auth/test-mode';
import type { AppFlagName } from '@/lib/flags/contracts';
import {
  clearAppFlagOverrides,
  getAppFlagDefault,
  installAppFlagOverrides,
} from './helpers/app-flag-overrides';
import { setTestUserPlan } from './helpers/plan-helpers';

const DESIGN_V1_FLAGS = [
  'DESIGN_V1_RELEASES',
  'DESIGN_V1_TASKS',
  'DESIGN_V1_CHAT_ENTITIES',
  'DESIGN_V1_LYRICS',
  'DESIGN_V1_LIBRARY',
  'DESIGN_V1_AUTH',
  'DESIGN_V1_ONBOARDING',
] as const satisfies readonly AppFlagName[];

type DesignV1Flag = (typeof DESIGN_V1_FLAGS)[number];
type RequiredPersona = Extract<DevTestAuthPersona, 'creator' | 'creator-ready'>;

const REQUIRED_PERSONAS = ['creator', 'creator-ready'] as const;

interface SurfaceCase {
  readonly flagName: DesignV1Flag;
  readonly route: string;
  readonly persona?: RequiredPersona;
  readonly prepare?: (page: Page) => Promise<void>;
  readonly assertDefault: (page: Page) => Promise<void>;
  readonly assertEnabled: (page: Page) => Promise<void>;
}

test.use({ storageState: { cookies: [], origins: [] } });

const resolvedPersonaUserIds = new Map<RequiredPersona, string>();

function getBaseUrl(): string {
  return process.env.BASE_URL ?? 'http://localhost:3100';
}

async function resolvePersonaUserId(
  request: APIRequestContext,
  persona: RequiredPersona
): Promise<string> {
  const response = await request.post(
    new URL('/api/dev/test-auth/session', getBaseUrl()).toString(),
    {
      data: { persona },
    }
  );
  expect(response.ok(), `Failed to resolve ${persona} test persona`).toBe(true);

  const payload = (await response.json()) as { userId?: string | null };
  const userId = payload.userId?.trim();
  expect(userId, `Missing ${persona} test persona userId`).toBeTruthy();
  return userId!;
}

async function gotoSurface(page: Page, route: string): Promise<void> {
  await page.goto(route, {
    timeout: 120_000,
    waitUntil: 'domcontentloaded',
  });
}

async function expectNotFound(page: Page): Promise<void> {
  await expect(page.getByTestId('not-found')).toBeVisible({
    timeout: 30_000,
  });
}

async function prepareAuthenticatedSurface(
  page: Page,
  persona: RequiredPersona = 'creator-ready'
): Promise<void> {
  const userId = resolvedPersonaUserIds.get(persona);
  expect(userId, `Unresolved ${persona} test persona`).toBeTruthy();

  const baseUrl = getBaseUrl();
  await page.context().addCookies([
    {
      name: TEST_MODE_COOKIE,
      value: TEST_AUTH_BYPASS_MODE,
      url: baseUrl,
      sameSite: 'Lax',
    },
    {
      name: TEST_USER_ID_COOKIE,
      value: userId!,
      url: baseUrl,
      sameSite: 'Lax',
    },
    {
      name: TEST_PERSONA_COOKIE,
      value: persona,
      url: baseUrl,
      sameSite: 'Lax',
    },
  ]);
}

async function prepareProAuthenticatedSurface(page: Page): Promise<void> {
  await prepareAuthenticatedSurface(page, 'creator-ready');
  await setTestUserPlan(page, 'pro');
}

const SURFACE_CASES: readonly SurfaceCase[] = [
  {
    flagName: 'DESIGN_V1_RELEASES',
    route: APP_ROUTES.DASHBOARD_RELEASES,
    persona: 'creator-ready',
    assertDefault: async page => {
      const matrix = page.getByTestId('releases-matrix');
      await expect(matrix).toBeVisible({ timeout: 30_000 });
      await expect(matrix).not.toHaveAttribute(
        'data-design-v1-releases',
        'true'
      );
    },
    assertEnabled: async page => {
      const shellReleasesView = page.getByTestId('shell-releases-view');
      await expect(shellReleasesView).toBeVisible({ timeout: 30_000 });
      await expect(shellReleasesView).toHaveAttribute(
        'data-design-v1-releases',
        'true',
        {
          timeout: 30_000,
        }
      );
    },
  },
  {
    flagName: 'DESIGN_V1_TASKS',
    route: APP_ROUTES.DASHBOARD_TASKS,
    prepare: prepareProAuthenticatedSurface,
    assertDefault: async page => {
      const workspace = page.getByTestId('tasks-workspace');
      await expect(workspace).toBeVisible({ timeout: 30_000 });
      await expect(workspace).not.toHaveAttribute(
        'data-design-v1-tasks',
        'true'
      );
    },
    assertEnabled: async page => {
      const workspace = page.getByTestId('tasks-workspace');
      await expect(workspace).toBeVisible({ timeout: 30_000 });
      await expect(workspace).toHaveAttribute('data-design-v1-tasks', 'true');
    },
  },
  {
    flagName: 'DESIGN_V1_CHAT_ENTITIES',
    route: APP_ROUTES.CHAT,
    persona: 'creator-ready',
    assertDefault: async page => {
      const chatContent = page.getByTestId('chat-content');
      await expect(chatContent).toBeVisible({ timeout: 30_000 });
      await expect(chatContent).not.toHaveAttribute(
        'data-design-v1-chat-entities',
        'true'
      );
    },
    assertEnabled: async page => {
      const chatContent = page.getByTestId('chat-content');
      await expect(chatContent).toBeVisible({ timeout: 30_000 });
      await expect(chatContent).toHaveAttribute(
        'data-design-v1-chat-entities',
        'true',
        { timeout: 30_000 }
      );
    },
  },
  {
    flagName: 'DESIGN_V1_LYRICS',
    route: `${APP_ROUTES.LYRICS}/flag-matrix-track`,
    persona: 'creator-ready',
    assertDefault: expectNotFound,
    assertEnabled: async page => {
      await expect(
        page.getByRole('heading', { name: 'No lyrics yet' })
      ).toBeVisible({
        timeout: 30_000,
      });
    },
  },
  {
    flagName: 'DESIGN_V1_LIBRARY',
    route: APP_ROUTES.DASHBOARD_LIBRARY,
    persona: 'creator-ready',
    assertDefault: expectNotFound,
    assertEnabled: async page => {
      await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible({
        timeout: 30_000,
      });
    },
  },
  {
    flagName: 'DESIGN_V1_AUTH',
    route: APP_ROUTES.SIGNIN,
    assertDefault: async page => {
      await expect(page.locator('[data-auth-shell]')).toHaveAttribute(
        'data-design-v1-auth',
        'false',
        { timeout: 30_000 }
      );
    },
    assertEnabled: async page => {
      await expect(page.locator('[data-auth-shell]')).toHaveAttribute(
        'data-design-v1-auth',
        'true',
        { timeout: 30_000 }
      );
    },
  },
  {
    flagName: 'DESIGN_V1_ONBOARDING',
    route: `${APP_ROUTES.ONBOARDING}?handle=design-v1-flag-matrix`,
    persona: 'creator',
    assertDefault: async page => {
      await expect(
        page.getByTestId('onboarding-experience-shell')
      ).toHaveAttribute('data-onboarding-visual-variant', 'default', {
        timeout: 30_000,
      });
    },
    assertEnabled: async page => {
      await expect(
        page.getByTestId('onboarding-experience-shell')
      ).toHaveAttribute('data-onboarding-visual-variant', 'v1', {
        timeout: 30_000,
      });
    },
  },
];

test.describe('Design V1 flagged surfaces', () => {
  test.setTimeout(300_000);

  test.skip(
    process.env.E2E_USE_TEST_AUTH_BYPASS !== '1',
    'Requires E2E_USE_TEST_AUTH_BYPASS=1'
  );

  test('keeps every Design V1 app flag default-off', () => {
    for (const flagName of DESIGN_V1_FLAGS) {
      expect(getAppFlagDefault(flagName), `${flagName} default`).toBe(false);
    }
  });

  test.describe('surface routes', () => {
    test.beforeAll(async ({ request }) => {
      test.setTimeout(300_000);
      resolvedPersonaUserIds.clear();

      for (const persona of REQUIRED_PERSONAS) {
        resolvedPersonaUserIds.set(
          persona,
          await resolvePersonaUserId(request, persona)
        );
      }
    });

    for (const surface of SURFACE_CASES) {
      test(`${surface.flagName} preserves default-off route behavior`, async ({
        page,
      }) => {
        await clearAppFlagOverrides(page);

        if (surface.prepare) {
          await surface.prepare(page);
        } else if (surface.persona) {
          await prepareAuthenticatedSurface(page, surface.persona);
        }

        await gotoSurface(page, surface.route);
        await surface.assertDefault(page);
      });

      test(`${surface.flagName} renders when forced on`, async ({ page }) => {
        await installAppFlagOverrides(page, { [surface.flagName]: true });

        if (surface.prepare) {
          await surface.prepare(page);
        } else if (surface.persona) {
          await prepareAuthenticatedSurface(page, surface.persona);
        }

        await gotoSurface(page, surface.route);
        await surface.assertEnabled(page);
      });
    }
  });
});
