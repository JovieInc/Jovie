/**
 * Workspace lock + money visibility (JOV-6829).
 *
 * Both are scope flags stored in cookies so the server renders the locked /
 * redacted state on first paint — no content flash, no layout shift. Lock
 * scopes map onto future per-role permissions: `workspace` hides the whole
 * main content area; `money` redacts payouts, revenue, and balances.
 */

export const WORKSPACE_LOCK_COOKIE = 'jovie_workspace_lock';
export const MONEY_HIDDEN_COOKIE = 'jovie_money_hidden';

const COOKIE_ON = '1';

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const entry = document.cookie
    .split(';')
    .map(c => c.trim())
    .find(c => c.startsWith(`${name}=`));
  return entry ? entry.slice(name.length + 1) : null;
}

function writeCookie(name: string, value: string | null) {
  if (typeof document === 'undefined') return;
  const base = `${name}=${value ?? ''}; path=/; SameSite=Lax`;
  document.cookie =
    value === null ? `${base}; Max-Age=0` : `${base}; Max-Age=31536000`;
}

export function isWorkspaceLockCookieValue(value: string | undefined | null) {
  return value === COOKIE_ON;
}

export function isMoneyHiddenCookieValue(value: string | undefined | null) {
  return value === COOKIE_ON;
}

/** Lock the workspace and re-render so the lock screen replaces content. */
export function lockWorkspace() {
  writeCookie(WORKSPACE_LOCK_COOKIE, COOKIE_ON);
  globalThis.location?.reload();
}

/** Clear the workspace lock. Call only after a successful step-up. */
export function clearWorkspaceLock() {
  writeCookie(WORKSPACE_LOCK_COOKIE, null);
}

export function isMoneyHidden() {
  return readCookie(MONEY_HIDDEN_COOKIE) === COOKIE_ON;
}

/** Toggle money visibility and re-render so every surface redacts. */
export function setMoneyHidden(hidden: boolean) {
  writeCookie(MONEY_HIDDEN_COOKIE, hidden ? COOKIE_ON : null);
  globalThis.location?.reload();
}
