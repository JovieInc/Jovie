import type { Page } from '@playwright/test';
import {
  APP_FLAG_DEFAULTS,
  APP_FLAG_OVERRIDE_KEYS,
  type AppFlagName,
} from '@/lib/flags/contracts';
import {
  APP_FLAG_OVERRIDES_COOKIE,
  FF_OVERRIDES_KEY,
} from '@/lib/flags/overrides';

type AppFlagOverrides = Partial<Record<AppFlagName, boolean>>;

function serializeAppFlagOverrides(overrides: AppFlagOverrides): string {
  const storedOverrides = Object.fromEntries(
    Object.entries(overrides).map(([flagName, enabled]) => [
      APP_FLAG_OVERRIDE_KEYS[flagName as AppFlagName],
      enabled,
    ])
  );

  return JSON.stringify(storedOverrides);
}

export function getAppFlagDefault(flagName: AppFlagName): boolean {
  return APP_FLAG_DEFAULTS[flagName];
}

export async function installAppFlagOverrides(
  page: Page,
  overrides: AppFlagOverrides
): Promise<void> {
  const serialized = serializeAppFlagOverrides(overrides);

  // Seed the cookie before any HTTP request so SSR/middleware sees the
  // override on the first navigation. addInitScript runs only after the
  // initial response, so the cookie alone via init script would be
  // invisible to server-side flag reads on first goto.
  await page.context().addCookies([
    {
      name: APP_FLAG_OVERRIDES_COOKIE,
      value: encodeURIComponent(serialized),
      url: process.env.BASE_URL ?? 'http://localhost:3100',
      sameSite: 'Lax',
    },
  ]);

  // Seed localStorage for client-side reads via init script.
  await page.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, value);
    },
    {
      key: FF_OVERRIDES_KEY,
      value: serialized,
    }
  );
}

export async function clearAppFlagOverrides(page: Page): Promise<void> {
  await page.addInitScript(
    ({ cookieName, key }) => {
      localStorage.removeItem(key);
      document.cookie = `${cookieName}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
    },
    {
      cookieName: APP_FLAG_OVERRIDES_COOKIE,
      key: FF_OVERRIDES_KEY,
    }
  );
}
