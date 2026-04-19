import {
  APP_FLAG_OVERRIDE_KEYS,
  type AppFlagName,
  type AppFlagSnapshot,
} from './contracts';

export const FF_OVERRIDES_KEY = '__ff_overrides';
export const APP_FLAG_OVERRIDES_COOKIE = 'jovie_app_flag_overrides';

export type AppFlagOverrideRecord = Record<string, boolean>;

function isBooleanRecord(value: unknown): value is AppFlagOverrideRecord {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.values(value).every(entry => typeof entry === 'boolean')
  );
}

export function parseAppFlagOverrides(
  rawValue: string | null | undefined
): AppFlagOverrideRecord {
  if (!rawValue) return {};

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    return isBooleanRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function readStoredAppFlagOverrides(): AppFlagOverrideRecord {
  if (globalThis.window === undefined) return {};
  try {
    return parseAppFlagOverrides(localStorage.getItem(FF_OVERRIDES_KEY));
  } catch {
    return {};
  }
}

function getSecureCookieAttribute(): string {
  if (globalThis.window === undefined) return '';
  return globalThis.location.protocol === 'https:' ? '; Secure' : '';
}

export function writeStoredAppFlagOverrides(
  overrides: AppFlagOverrideRecord
): void {
  if (globalThis.window === undefined) return;

  const serialized = JSON.stringify(overrides);
  localStorage.setItem(FF_OVERRIDES_KEY, serialized);
  document.cookie = `${APP_FLAG_OVERRIDES_COOKIE}=${encodeURIComponent(serialized)}; path=/; SameSite=Lax${getSecureCookieAttribute()}`;
}

export function clearStoredAppFlagOverrides(): void {
  if (globalThis.window === undefined) return;

  localStorage.removeItem(FF_OVERRIDES_KEY);
  document.cookie = `${APP_FLAG_OVERRIDES_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax${getSecureCookieAttribute()}`;
}

export function getAppFlagOverrideValue(
  flagName: AppFlagName,
  overrides: AppFlagOverrideRecord
): boolean | undefined {
  const overrideKey = APP_FLAG_OVERRIDE_KEYS[flagName];
  if (!(overrideKey in overrides)) return undefined;
  return overrides[overrideKey];
}

export function applyAppFlagOverrides(
  snapshot: AppFlagSnapshot,
  overrides: AppFlagOverrideRecord
): AppFlagSnapshot {
  const next = { ...snapshot };

  for (const flagName of Object.keys(snapshot) as AppFlagName[]) {
    const overrideValue = getAppFlagOverrideValue(flagName, overrides);
    if (overrideValue !== undefined) {
      next[flagName] = overrideValue;
    }
  }

  return next;
}
