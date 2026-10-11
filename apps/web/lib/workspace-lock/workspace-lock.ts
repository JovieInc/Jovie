/**
 * Workspace lock + money visibility (JOV-6829).
 *
 * Money visibility remains a client cookie so the server can render redacted
 * values on first paint. Ovie privacy locking is server-owned; the legacy
 * workspace cookie is only cleared during migration and never grants a lock.
 */

export const WORKSPACE_LOCK_COOKIE = 'jovie_workspace_lock';
export const MONEY_HIDDEN_COOKIE = 'jovie_money_hidden';

const COOKIE_ON = '1';
const PRIVACY_LOCK_PATH = '/api/ovie/privacy-lock';
const PRIVACY_LOCK_REQUEST_TIMEOUT_MS = 10_000;
export const WORKSPACE_PRIVACY_LOCK_CONFIRMED_EVENT =
  'ovie:privacy-lock-confirmed';

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const entry = document.cookie
    .split(';')
    .map(cookie => cookie.trim())
    .find(cookie => cookie.startsWith(`${name}=`));
  return entry ? entry.slice(name.length + 1) : null;
}

function writeCookie(name: string, value: string | null) {
  if (typeof document === 'undefined') return;
  const base = `${name}=${value ?? ''}; path=/; SameSite=Lax`;
  document.cookie =
    value === null ? `${base}; Max-Age=0` : `${base}; Max-Age=31536000`;
}

/** Compatibility predicates for reading existing scope flags. */
export function isWorkspaceLockCookieValue(value: string | null | undefined) {
  return value === COOKIE_ON;
}

export function isMoneyHiddenCookieValue(value: string | null | undefined) {
  return value === COOKIE_ON;
}

export type WorkspacePrivacyLockAction =
  | 'enable'
  | 'disable'
  | 'lock'
  | 'unlock';

export interface WorkspacePrivacyLockState {
  enabled: boolean;
  locked: boolean;
  unlockedUntil: string | null;
}

export class WorkspacePrivacyLockError extends Error {
  constructor(
    message: string,
    readonly code: string = 'unconfirmed'
  ) {
    super(message);
    this.name = 'WorkspacePrivacyLockError';
  }
}

function isPrivacyLockState(
  value: unknown
): value is WorkspacePrivacyLockState {
  if (typeof value !== 'object' || value === null) return false;
  const state = value as Record<string, unknown>;
  if (
    typeof state.enabled !== 'boolean' ||
    typeof state.locked !== 'boolean' ||
    (typeof state.unlockedUntil !== 'string' && state.unlockedUntil !== null)
  ) {
    return false;
  }
  if (!state.enabled)
    return state.locked === false && state.unlockedUntil === null;
  if (state.locked) return state.unlockedUntil === null;
  if (typeof state.unlockedUntil !== 'string') return false;
  const unlockedUntil = Date.parse(state.unlockedUntil);
  return Number.isFinite(unlockedUntil) && unlockedUntil > Date.now();
}

function apiErrorMessage(code: string): string {
  switch (code) {
    case 'unauthenticated':
    case 'UNAUTHORIZED':
      return 'Your session expired. Sign in again to unlock Ovie.';
    case 'forbidden':
    case 'FORBIDDEN':
      return 'You do not have permission to unlock Ovie.';
    case 'PASSKEY_STEP_UP_REQUIRED':
      return 'This passkey cannot unlock Ovie. Use the passkey set up for admin access.';
    case 'PASSKEY_SETUP_REQUIRED':
      return 'Set up an admin-capable passkey before enabling Ovie privacy lock.';
    case 'PRIVACY_UNLOCK_REQUIRED':
      return 'Unlock Ovie before changing this privacy setting.';
    default:
      return 'Could not confirm the Ovie privacy lock. Check your connection and try again.';
  }
}

async function requestPrivacyLockState(
  init: RequestInit
): Promise<WorkspacePrivacyLockState> {
  const controller = new AbortController();
  const cancel = () => controller.abort(init.signal?.reason);
  init.signal?.addEventListener('abort', cancel, { once: true });
  if (init.signal?.aborted) cancel();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fetch(PRIVACY_LOCK_PATH, { ...init, signal: controller.signal }).then(
        parsePrivacyLockState
      ),
      new Promise<WorkspacePrivacyLockState>((_, reject) => {
        timeout = globalThis.setTimeout(() => {
          controller.abort();
          reject(
            new WorkspacePrivacyLockError(
              'The Ovie privacy lock took too long to respond. Try again.',
              'timeout'
            )
          );
        }, PRIVACY_LOCK_REQUEST_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    if (error instanceof WorkspacePrivacyLockError) throw error;
    throw new WorkspacePrivacyLockError(
      'Could not confirm the Ovie privacy lock. Check your connection and try again.'
    );
  } finally {
    init.signal?.removeEventListener('abort', cancel);
    if (timeout !== undefined) globalThis.clearTimeout(timeout);
  }
}

async function parsePrivacyLockState(
  response: Response
): Promise<WorkspacePrivacyLockState> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new WorkspacePrivacyLockError(
      'Could not confirm the Ovie privacy lock. Check your connection and try again.'
    );
  }
  if (!response.ok) {
    const code =
      typeof body === 'object' &&
      body !== null &&
      typeof (body as Record<string, unknown>).code === 'string'
        ? String((body as Record<string, unknown>).code)
        : 'unconfirmed';
    throw new WorkspacePrivacyLockError(apiErrorMessage(code), code);
  }
  if (!isPrivacyLockState(body)) {
    throw new WorkspacePrivacyLockError(
      'Could not confirm the Ovie privacy lock. Check your connection and try again.'
    );
  }
  return body;
}

export async function getWorkspacePrivacyLockState(): Promise<WorkspacePrivacyLockState> {
  return requestPrivacyLockState({
    credentials: 'same-origin',
    cache: 'no-store',
  });
}

export async function updateWorkspacePrivacyLock(
  action: WorkspacePrivacyLockAction,
  signal?: AbortSignal
): Promise<WorkspacePrivacyLockState> {
  return requestPrivacyLockState({
    method: 'POST',
    signal,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
}

/** Notify mounted Ovie boundaries only after the server confirms a lock. */
export function confirmWorkspacePrivacyLock(state: WorkspacePrivacyLockState) {
  if (!state.enabled || !state.locked || typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<WorkspacePrivacyLockState>(
      WORKSPACE_PRIVACY_LOCK_CONFIRMED_EVENT,
      { detail: state }
    )
  );
}

/** Lock Ovie through its server-owned privacy state and re-render on confirmation. */
export async function lockWorkspace() {
  const state = await updateWorkspacePrivacyLock('lock');
  if (!state.enabled || !state.locked) {
    throw new WorkspacePrivacyLockError(
      'Ovie did not confirm the privacy lock. Try again.'
    );
  }
  confirmWorkspacePrivacyLock(state);
  clearWorkspaceLock();
  globalThis.location?.reload();
}

/** Clear only the legacy cookie after the server confirms an Ovie unlock. */
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
