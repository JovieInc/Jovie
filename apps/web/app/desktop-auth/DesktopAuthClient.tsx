'use client';

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { sanitizeDesktopAuthUrl } from '@/lib/desktop/auth-return';
import {
  closeDesktopAuthWindow,
  copyDesktopAuthUrl,
  type DesktopAuthActionResult,
  openDesktopAuthUrl,
  redeemDesktopAuthReturnCode,
  supportsDesktopAuthReturnCode,
  useDesktopAppBootSignal,
} from '@/lib/desktop/electron-bridge';
import { MacCinematicSurface } from './MacCinematicSurface';

export type DesktopAuthOpenState = 'idle' | 'opening' | 'opened' | 'error';
type CopyState = 'idle' | 'copying' | 'copied' | 'error';
type RedeemState = 'idle' | 'redeeming' | 'redeemed' | 'error';

interface DesktopAuthClientProps {
  readonly authUrlParam: string | null;
}

interface DesktopAuthHandoffActionsProps {
  readonly authUrl?: string | null;
  readonly onOpenStateChange?: (state: DesktopAuthOpenState) => void;
  readonly resolveAuthUrl?: () => string | null;
  readonly showCancelSignIn?: boolean;
}

const DESKTOP_AUTH_ACTION_TIMEOUT_MS = 5000;
const DESKTOP_AUTH_REDEEM_TIMEOUT_MS = 15_000;
// Most browser sign-ins return well inside this window. After it, the browser
// probably opened somewhere unseen (another Space, a full-screen app, a
// different default browser) so point at the copy-link path. Any browser can
// finish it; its return page shows a code for "Enter a Code".
export const DESKTOP_AUTH_STILL_WAITING_MS = 30_000;
const STATUS_CHECK_BROWSER = 'Check your browser.';
const STATUS_STILL_WAITING =
  'Not seeing it? Copy the sign-in link and paste it into any browser.';
const STATUS_COPIED = 'Sign-in link copied. Paste it into any browser.';
const STATUS_ENTER_CODE =
  'Signed in but Jovie did not open? Enter the code your browser shows.';
const STATUS_REDEEMING = 'Signing in...';
// Matches the return page: consonants only, formatted XXXX-XXXX.
const RETURN_CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ';
const RETURN_CODE_LENGTH = 8;
const INPUT_CLASS =
  'h-11 w-full rounded-full border border-white/10 bg-white/5 px-4 text-center font-mono text-app uppercase tracking-widest text-white placeholder:text-white/32 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25';
const TEXT_ACTION_CLASS =
  'mt-1 inline-flex h-8 items-center justify-center rounded-full px-3 text-xs font-medium text-white/56 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25';

export function normalizeReturnCodeInput(value: string): string {
  let normalized = '';
  for (const char of value.toUpperCase()) {
    if (RETURN_CODE_ALPHABET.includes(char)) normalized += char;
    if (normalized.length === RETURN_CODE_LENGTH) break;
  }
  return normalized.length > 4
    ? `${normalized.slice(0, 4)}-${normalized.slice(4)}`
    : normalized;
}

function isCompleteReturnCode(value: string): boolean {
  return value.replace('-', '').length === RETURN_CODE_LENGTH;
}

function formatRedeemError(reason?: string): string {
  switch (reason) {
    case 'invalid-code':
      return 'That code did not match. Check it and try again.';
    case 'pkce-expired':
      return 'This sign-in expired. Open the browser again for a new code.';
    case 'no-pending-flow':
      return 'Open the browser to sign in first. It shows a code when you finish.';
    case 'rate-limited':
      return 'Too many tries. Wait a minute and try again.';
    default:
      return 'Could not reach Jovie. Check your connection and try again.';
  }
}

const PRIMARY_ACTION_CLASS =
  'inline-flex h-11 w-full items-center justify-center rounded-full bg-white px-4 text-app font-medium text-(--color-bg-base) transition-colors hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35 disabled:cursor-not-allowed disabled:opacity-55 dark:bg-white';
const SECONDARY_ACTION_CLASS =
  'inline-flex h-11 w-full items-center justify-center rounded-full border border-white/10 px-4 text-app font-medium text-white/72 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 disabled:cursor-not-allowed disabled:opacity-55';

function formatOpenError(reason?: string): string {
  if (reason === 'blocked-url' || reason === 'invalid-auth-url') {
    return 'Sign-in could not start. Close this window and try again from Jovie.';
  }

  return 'The browser did not open. Try again, or copy the sign-in link.';
}

function formatCopyError(reason?: string): string {
  if (reason === 'blocked-url' || reason === 'invalid-auth-url') {
    return 'The sign-in link is no longer valid. Try opening the browser again.';
  }

  return 'The sign-in link could not be copied. Try again.';
}

async function runWithTimeout(
  action: Promise<DesktopAuthActionResult>,
  timeoutReason: string,
  timeoutMs = DESKTOP_AUTH_ACTION_TIMEOUT_MS
): Promise<DesktopAuthActionResult> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      action,
      new Promise<DesktopAuthActionResult>(resolve => {
        timeoutId = setTimeout(
          () => resolve({ ok: false, reason: timeoutReason }),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

function getAppOrigin(): string {
  return globalThis.window === undefined
    ? 'https://jov.ie'
    : globalThis.window.location.origin;
}

export function DesktopAuthHandoffActions({
  authUrl = null,
  onOpenStateChange,
  resolveAuthUrl,
  showCancelSignIn = false,
}: DesktopAuthHandoffActionsProps) {
  const [openState, setOpenState] = useState<DesktopAuthOpenState>('idle');
  const [openError, setOpenError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const [copyError, setCopyError] = useState<string | null>(null);
  const [stillWaiting, setStillWaiting] = useState(false);
  const [codeMode, setCodeMode] = useState(false);
  const [returnCode, setReturnCode] = useState('');
  const [redeemState, setRedeemState] = useState<RedeemState>('idle');
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [canRedeemCode, setCanRedeemCode] = useState(false);
  const primaryActionRef = useRef<HTMLButtonElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCanRedeemCode(supportsDesktopAuthReturnCode());
  }, []);

  useEffect(() => {
    if (codeMode) codeInputRef.current?.focus();
  }, [codeMode]);

  useEffect(() => {
    setStillWaiting(false);
    if (openState !== 'opened') return;
    const timeoutId = setTimeout(
      () => setStillWaiting(true),
      DESKTOP_AUTH_STILL_WAITING_MS
    );
    return () => clearTimeout(timeoutId);
  }, [openState]);

  useEffect(() => {
    if (openState === 'error') primaryActionRef.current?.focus();
  }, [openState]);

  const getAuthUrl = useCallback(
    () => authUrl ?? resolveAuthUrl?.() ?? null,
    [authUrl, resolveAuthUrl]
  );

  const updateOpenState = useCallback(
    (state: DesktopAuthOpenState) => {
      setOpenState(state);
      onOpenStateChange?.(state);
    },
    [onOpenStateChange]
  );

  const openAuthUrl = useCallback(async () => {
    const currentAuthUrl = getAuthUrl();
    if (!currentAuthUrl || openState === 'opening' || copyState === 'copying') {
      return;
    }

    updateOpenState('opening');
    setOpenError(null);
    setCopyState('idle');
    setCopyError(null);
    try {
      const result = await runWithTimeout(
        openDesktopAuthUrl(currentAuthUrl),
        'desktop-auth-open-timeout'
      );
      if (result.ok) {
        updateOpenState('opened');
        return;
      }
      updateOpenState('error');
      setOpenError(formatOpenError(result.reason));
    } catch {
      updateOpenState('error');
      setOpenError(formatOpenError());
    }
  }, [copyState, getAuthUrl, openState, updateOpenState]);

  const copyAuthUrl = useCallback(async () => {
    const currentAuthUrl = getAuthUrl();
    if (!currentAuthUrl || openState === 'opening' || copyState === 'copying') {
      return;
    }

    setCopyState('copying');
    setCopyError(null);
    try {
      const result = await runWithTimeout(
        copyDesktopAuthUrl(currentAuthUrl),
        'desktop-auth-copy-timeout'
      );
      if (result.ok) {
        setCopyState('copied');
        return;
      }
      setCopyState('error');
      setCopyError(formatCopyError(result.reason));
    } catch {
      setCopyState('error');
      setCopyError(formatCopyError());
    }
  }, [copyState, getAuthUrl, openState]);

  const submitReturnCode = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!isCompleteReturnCode(returnCode) || redeemState === 'redeeming') {
        return;
      }

      setRedeemState('redeeming');
      setRedeemError(null);
      try {
        const result = await runWithTimeout(
          redeemDesktopAuthReturnCode(returnCode),
          'desktop-auth-return-code-timeout',
          // A network round trip, unlike the local open/copy actions.
          DESKTOP_AUTH_REDEEM_TIMEOUT_MS
        );
        if (result.ok) {
          setRedeemState('redeemed');
          return;
        }
        setRedeemState('error');
        setRedeemError(formatRedeemError(result.reason));
      } catch {
        setRedeemState('error');
        setRedeemError(formatRedeemError());
      }
      codeInputRef.current?.focus();
    },
    [redeemState, returnCode]
  );

  const toggleCodeMode = useCallback(() => {
    setCodeMode(current => !current);
    setRedeemState('idle');
    setRedeemError(null);
  }, []);

  const hasAuthUrl = authUrl !== null || resolveAuthUrl !== undefined;
  const isBusy = openState === 'opening' || copyState === 'copying';
  const openLabel =
    openState === 'opening'
      ? 'Opening Browser...'
      : openState === 'opened'
        ? 'Open Browser Again'
        : openState === 'error'
          ? 'Try Again'
          : 'Continue in Browser';
  const copyLabel =
    copyState === 'copying' ? 'Copying Sign-In Link...' : 'Copy Sign-In Link';
  const openedStatus = stillWaiting
    ? STATUS_STILL_WAITING
    : STATUS_CHECK_BROWSER;
  const actionStatusText =
    copyState === 'copied'
      ? STATUS_COPIED
      : (copyError ?? (openState === 'opened' ? openedStatus : openError));
  const codeStatusText =
    redeemState === 'redeeming' || redeemState === 'redeemed'
      ? STATUS_REDEEMING
      : (redeemError ?? STATUS_ENTER_CODE);
  const statusText = codeMode ? codeStatusText : actionStatusText;
  const cancelButton = showCancelSignIn ? (
    <button
      type='button'
      className={SECONDARY_ACTION_CLASS}
      onClick={() => {
        closeDesktopAuthWindow().catch(() => {});
      }}
    >
      Cancel Sign-In
    </button>
  ) : null;

  return (
    <>
      {codeMode ? (
        <form
          className='mt-8 flex w-full flex-col items-center justify-center gap-2'
          data-desktop-auth-state='code'
          data-testid='desktop-auth-code-form'
          onSubmit={submitReturnCode}
        >
          <input
            ref={codeInputRef}
            aria-label='Code From Your Browser'
            autoCapitalize='characters'
            autoComplete='one-time-code'
            className={INPUT_CLASS}
            inputMode='text'
            maxLength={9}
            placeholder='XXXX-XXXX'
            spellCheck={false}
            value={returnCode}
            onChange={event => {
              setReturnCode(normalizeReturnCodeInput(event.target.value));
              if (redeemState === 'error') {
                setRedeemState('idle');
                setRedeemError(null);
              }
            }}
          />
          <button
            type='submit'
            className={PRIMARY_ACTION_CLASS}
            disabled={
              !isCompleteReturnCode(returnCode) ||
              redeemState === 'redeeming' ||
              redeemState === 'redeemed'
            }
          >
            {redeemState === 'redeeming' ? 'Signing In...' : 'Continue'}
          </button>
          {cancelButton}
        </form>
      ) : (
        <div
          className='mt-8 flex w-full flex-col items-center justify-center gap-2'
          data-desktop-auth-state={openState}
          data-testid='desktop-auth-actions'
        >
          <button
            ref={primaryActionRef}
            type='button'
            className={PRIMARY_ACTION_CLASS}
            disabled={!hasAuthUrl || isBusy}
            onClick={openAuthUrl}
          >
            {openLabel}
          </button>
          <button
            type='button'
            className={SECONDARY_ACTION_CLASS}
            disabled={!hasAuthUrl || isBusy}
            onClick={copyAuthUrl}
          >
            {copyLabel}
          </button>
          {cancelButton}
        </div>
      )}
      <p
        aria-live='polite'
        role='status'
        className='mt-3 min-h-10 text-xs leading-5 text-white/56'
      >
        {hasAuthUrl ? statusText : 'Start sign-in again from Jovie.'}
      </p>
      {canRedeemCode && hasAuthUrl ? (
        <button
          type='button'
          className={TEXT_ACTION_CLASS}
          disabled={redeemState === 'redeeming' || redeemState === 'redeemed'}
          onClick={toggleCodeMode}
        >
          {codeMode ? 'Back to Browser Sign-In' : 'Enter a Code'}
        </button>
      ) : (
        // Reserve the row so the centered shell does not shift once the
        // bridge capability check resolves after mount.
        <div aria-hidden='true' className='mt-1 h-8' />
      )}
    </>
  );
}

export function DesktopAuthClient({ authUrlParam }: DesktopAuthClientProps) {
  useDesktopAppBootSignal();
  const [openState, setOpenState] = useState<DesktopAuthOpenState>('idle');
  const appOrigin = getAppOrigin();
  const authUrl = useMemo(
    () => sanitizeDesktopAuthUrl(authUrlParam, appOrigin),
    [authUrlParam, appOrigin]
  );

  return (
    <MacCinematicSurface state={openState} testId='desktop-auth-handoff'>
      <section className='relative z-10 flex w-full max-w-90 flex-col items-center px-6 py-16 text-center'>
        <h1 className='sr-only'>Sign In To Jovie</h1>
        <DesktopAuthHandoffActions
          authUrl={authUrl}
          onOpenStateChange={setOpenState}
          showCancelSignIn
        />
      </section>
    </MacCinematicSurface>
  );
}
