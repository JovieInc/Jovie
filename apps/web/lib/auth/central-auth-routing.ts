import {
  AUTH_CALLBACK_PATH,
  AUTH_STATE_PARAM,
  buildAuthCallbackPath,
} from '@jovie/auth-routing';

interface SearchParamReader {
  get(key: string): string | null;
}

const AUTH_STATE_PATTERN = /^[A-Za-z0-9._~-]{16,128}$/;

export function sanitizeAuthStateParam(
  state: string | null | undefined
): string | null {
  if (!state || !AUTH_STATE_PATTERN.test(state)) return null;
  return state;
}

export function getCentralAuthCallbackPath(
  searchParams: SearchParamReader
): string | null {
  const authState = sanitizeAuthStateParam(searchParams.get(AUTH_STATE_PARAM));
  return authState ? buildAuthCallbackPath(authState) : null;
}

export function isCentralAuthCallbackPath(route: string): boolean {
  try {
    const parsed = new URL(route, 'https://jov.ie');
    return parsed.pathname === AUTH_CALLBACK_PATH;
  } catch {
    return false;
  }
}
