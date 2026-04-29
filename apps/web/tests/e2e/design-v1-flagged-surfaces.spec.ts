/**
 * Focused Design V1 flag matrix.
 *
 * Verifies the single Design V1 runtime app flag remains default-off,
 * preserves the default route behavior with no override, and renders each
 * gated surface when forced on through the same browser override harness used
 * by local QA.
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
import {
  clearAppFlagOverrides,
  getAppFlagDefault,
  installAppFlagOverrides,
} from './helpers/app-flag-overrides';

type RequiredPersona = Extract<DevTestAuthPersona, 'creator' | 'creator-ready'>;

const REQUIRED_PERSONAS = ['creator', 'creator-ready'] as const;

interface SurfaceCase {
  readonly name: string;
  readonly route: string | ((page: Page) => Promise<string>);
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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

async function resolvePersonaUserId(
  request: APIRequestContext,
  persona: RequiredPersona
): Promise<string> {
  const url = new URL('/api/dev/test-auth/session', getBaseUrl()).toString();
  let lastFailure = 'No attempts completed';

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await request.post(url, {
        data: { persona },
        timeout: 240_000,
      });

      if (response.ok()) {
        const payload = (await response.json()) as { userId?: string | null };
        const userId = payload.userId?.trim();
        if (userId) return userId;
        lastFailure = 'Response was ok but did not include a userId';
      } else {
        lastFailure = `HTTP ${response.status()}: ${await response.text()}`;
      }
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }

    if (attempt < 3) {
      await sleep(5_000);
    }
  }

  throw new Error(
    `Failed to resolve ${persona} test persona after retries: ${lastFailure}`
  );
}

async function gotoSurface(page: Page, route: string): Promise<void> {
  await page.goto(route, {
    timeout: 240_000,
    waitUntil: 'domcontentloaded',
  });
}

async function resolveSurfaceRoute(
  page: Page,
  route: SurfaceCase['route']
): Promise<string> {
  return typeof route === 'function' ? route(page) : route;
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

async function prepareSeededE2EUser(page: Page): Promise<void> {
  const userId = process.env.E2E_CLERK_USER_ID?.trim();
  expect(
    userId,
    'E2E_CLERK_USER_ID is required for seeded release-backed lyrics coverage'
  ).toBeTruthy();

  await page.context().addCookies([
    {
      name: TEST_MODE_COOKIE,
      value: TEST_AUTH_BYPASS_MODE,
      url: getBaseUrl(),
      sameSite: 'Lax',
    },
    {
      name: TEST_USER_ID_COOKIE,
      value: userId!,
      url: getBaseUrl(),
      sameSite: 'Lax',
    },
  ]);
}

async function resolveSeededLyricsRoute(page: Page): Promise<string> {
  await gotoSurface(page, APP_ROUTES.DASHBOARD_RELEASES);
  await expect(page.getByTestId('releases-matrix')).toBeVisible({
    timeout: 30_000,
  });

  const releaseTrigger = page.locator('[data-testid^="release-open-"]').first();
  await expect(releaseTrigger).toBeVisible({ timeout: 30_000 });

  const testId = await releaseTrigger.getAttribute('data-testid');
  const releaseId = testId?.replace(/^release-open-/, '').trim();
  expect(releaseId, 'Expected seeded release id for lyrics route').toBeTruthy();

  return `${APP_ROUTES.LYRICS}/${releaseId}`;
}

const SURFACE_CASES: readonly SurfaceCase[] = [
  {
    name: 'releases',
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
    name: 'tasks',
    route: APP_ROUTES.DASHBOARD_TASKS,
    persona: 'creator-ready',
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
      await expect(workspace).toHaveAttribute('data-design-v1-tasks', 'true', {
        timeout: 30_000,
      });
    },
  },
  {
    name: 'chat entities',
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
    name: 'lyrics',
    route: resolveSeededLyricsRoute,
    prepare: prepareSeededE2EUser,
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
    name: 'library',
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
    name: 'auth',
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
    name: 'onboarding',
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
  test.setTimeout(600_000);

  test.skip(
    process.env.E2E_USE_TEST_AUTH_BYPASS !== '1',
    'Requires E2E_USE_TEST_AUTH_BYPASS=1'
  );

  test('keeps the Design V1 app flag default-off', () => {
    expect(getAppFlagDefault('DESIGN_V1'), 'DESIGN_V1 default').toBe(false);
  });

  test.describe('surface routes', () => {
    test.beforeAll(async ({ request }) => {
      test.setTimeout(600_000);
      resolvedPersonaUserIds.clear();

      for (const persona of REQUIRED_PERSONAS) {
        resolvedPersonaUserIds.set(
          persona,
          await resolvePersonaUserId(request, persona)
        );
      }
    });

    for (const surface of SURFACE_CASES) {
      test(`${surface.name} preserves default-off route behavior`, async ({
        page,
      }) => {
        await clearAppFlagOverrides(page);

        if (surface.prepare) {
          await surface.prepare(page);
        } else if (surface.persona) {
          await prepareAuthenticatedSurface(page, surface.persona);
        }

        await gotoSurface(page, await resolveSurfaceRoute(page, surface.route));
        await surface.assertDefault(page);
      });

      test(`${surface.name} renders when forced on`, async ({ page }) => {
        await installAppFlagOverrides(page, { DESIGN_V1: true });

        if (surface.prepare) {
          await surface.prepare(page);
        } else if (surface.persona) {
          await prepareAuthenticatedSurface(page, surface.persona);
        }

        await gotoSurface(page, await resolveSurfaceRoute(page, surface.route));
        await surface.assertEnabled(page);
      });
    }
  });
});
