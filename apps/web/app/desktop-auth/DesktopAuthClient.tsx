'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { sanitizeDesktopAuthUrl } from '@/lib/desktop/auth-return';
import {
  closeDesktopAuthWindow,
  copyDesktopAuthUrl,
  type DesktopAuthActionResult,
  openDesktopAuthUrl,
  useDesktopAppBootSignal,
} from '@/lib/desktop/electron-bridge';

export type DesktopAuthOpenState = 'idle' | 'opening' | 'opened' | 'error';
type CopyState = 'idle' | 'copying' | 'copied' | 'error';

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
  timeoutReason: string
): Promise<DesktopAuthActionResult> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      action,
      new Promise<DesktopAuthActionResult>(resolve => {
        timeoutId = setTimeout(
          () => resolve({ ok: false, reason: timeoutReason }),
          DESKTOP_AUTH_ACTION_TIMEOUT_MS
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
  const primaryActionRef = useRef<HTMLButtonElement>(null);

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
  const statusText =
    copyState === 'copied'
      ? 'Sign-in link copied.'
      : (copyError ??
        (openState === 'opened' ? 'Check your browser.' : openError));

  return (
    <>
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
        {showCancelSignIn ? (
          <button
            type='button'
            className={SECONDARY_ACTION_CLASS}
            onClick={() => {
              closeDesktopAuthWindow().catch(() => {});
            }}
          >
            Cancel Sign-In
          </button>
        ) : null}
      </div>
      <p
        aria-live='polite'
        role='status'
        className='mt-3 min-h-10 text-xs leading-5 text-white/56'
      >
        {hasAuthUrl ? statusText : 'Start sign-in again from Jovie.'}
      </p>
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
    <main
      className='relative isolate grid min-h-dvh place-items-center bg-base px-6 text-primary-token [color-scheme:dark]'
      data-desktop-auth-state={openState}
      data-testid='desktop-auth-handoff'
    >
      <section className='relative z-10 flex w-full max-w-90 flex-col items-center px-6 py-16 text-center'>
        <BrandLogo aria-hidden size={60} tone='white' />
        <h1 className='sr-only'>Sign In To Jovie</h1>
        <DesktopAuthHandoffActions
          authUrl={authUrl}
          onOpenStateChange={setOpenState}
          showCancelSignIn
        />
      </section>
    </main>
  );
}
