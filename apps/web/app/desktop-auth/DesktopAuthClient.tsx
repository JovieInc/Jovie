'use client';

import { Button } from '@jovie/ui';
import {
  type FormEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { sanitizeDesktopAuthUrl } from '@/lib/desktop/auth-return';
import {
  closeDesktopAuthWindow,
  completeDesktopPasskeySignIn,
  copyDesktopAuthUrl,
  type DesktopAuthActionResult,
  openDesktopAuthUrl,
  redeemDesktopAuthReturnCode,
  supportsDesktopAuthReturnCode,
  useDesktopAppBootSignal,
} from '@/lib/desktop/electron-bridge';
import { DesktopAuthCodeForm } from './DesktopAuthCodeForm';
import { DesktopAuthMethodOptions } from './DesktopAuthMethodOptions';
import {
  DesktopAuthCancelButton,
  DesktopAuthHeading,
  DesktopAuthStatus,
} from './DesktopAuthSharedView';
import { DesktopAuthTouchIdButton } from './DesktopAuthTouchIdButton';
import {
  type CopyState,
  type DesktopAuthOpenState,
  isCompleteReturnCode,
  type RedeemState,
  type SelectedMethod,
  type TouchIdState,
} from './desktop-auth-contract';
import { MacCinematicSurface } from './MacCinematicSurface';

export type { DesktopAuthOpenState } from './desktop-auth-contract';

interface DesktopAuthClientProps {
  readonly authUrlParam: string | null;
  /** Main process hint: this Mac enrolled Touch ID sign-in. */
  readonly touchIdHint?: boolean;
}

interface DesktopAuthHandoffActionsProps {
  readonly authUrl?: string | null;
  readonly onOpenStateChange?: (state: DesktopAuthOpenState) => void;
  readonly resolveAuthUrl?: () => string | null;
  readonly showCancelSignIn?: boolean;
  readonly showTouchId?: boolean;
}

const DESKTOP_AUTH_ACTION_TIMEOUT_MS = 5000;
const DESKTOP_AUTH_REDEEM_TIMEOUT_MS = 15_000;
// Most browser sign-ins return well inside this window. After it, the browser
// probably opened somewhere unseen, so point at the copy-link path. Any
// browser can finish it; its return page shows a code for "Enter a Code".
export const DESKTOP_AUTH_STILL_WAITING_MS = 30_000;
const RETURN_CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ';
const RETURN_CODE_LENGTH = 8;
const QR_CODE_SIZE = 176;

interface DesktopAuthPresentationInput {
  readonly copyError: string | null;
  readonly copyState: CopyState;
  readonly openError: string | null;
  readonly openState: DesktopAuthOpenState;
  readonly optionsOpen: boolean;
  readonly qrError: string | null;
  readonly qrReady: boolean;
  readonly redeemError: string | null;
  readonly redeemState: RedeemState;
  readonly selectedMethod: SelectedMethod;
  readonly stillWaiting: boolean;
  readonly touchIdState: TouchIdState;
}

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
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

function getAppOrigin(): string {
  return globalThis.window === undefined
    ? 'https://jov.ie'
    : globalThis.window.location.origin;
}

function getDesktopAuthPresentation({
  copyError,
  copyState,
  openError,
  openState,
  optionsOpen,
  qrError,
  qrReady,
  redeemError,
  redeemState,
  selectedMethod,
  stillWaiting,
  touchIdState,
}: DesktopAuthPresentationInput) {
  const openLabel =
    openState === 'opening'
      ? 'Opening Browser...'
      : openState === 'opened'
        ? 'Open Browser Again'
        : openState === 'error'
          ? 'Try Again'
          : 'Continue In Browser';
  const copyLabel =
    copyState === 'copying'
      ? 'Copying Sign-in Link...'
      : copyState === 'copied'
        ? 'Copy Sign-in Link Again'
        : 'Copy Sign-in Link';
  const actionStatusText =
    copyState === 'copying'
      ? 'Copying the sign-in link...'
      : copyState === 'copied'
        ? 'Sign-in link copied. Paste it into any browser.'
        : (copyError ??
          (openState === 'opening'
            ? 'Opening your browser...'
            : openState === 'opened'
              ? stillWaiting
                ? 'Not seeing it? Copy the sign-in link and paste it into any browser.'
                : 'Check your browser.'
              : openError));
  const codeStatusText =
    redeemState === 'redeeming'
      ? 'Signing in...'
      : redeemState === 'redeemed'
        ? 'Sign-in complete. Returning to Jovie...'
        : (redeemError ??
          'Signed in but Jovie did not open? Enter the code shown in your browser or on your phone.');
  const qrStatusText =
    qrError ??
    (qrReady
      ? 'Finish signing in on your phone, then enter the code it shows.'
      : 'Creating the QR code...');
  const touchIdStatusText =
    touchIdState === 'working' || touchIdState === 'signed-in'
      ? 'Waiting for Touch ID...'
      : touchIdState === 'error'
        ? 'Touch ID did not sign you in. Continue in the browser instead.'
        : null;
  const statusText =
    touchIdStatusText ??
    (selectedMethod === 'code'
      ? codeStatusText
      : selectedMethod === 'qr'
        ? qrStatusText
        : actionStatusText);
  const supportingCopy =
    selectedMethod === 'touch-id'
      ? 'Use Touch ID to unlock Jovie on this Mac.'
      : selectedMethod === 'code'
        ? 'Enter the return code shown in your browser or on your phone.'
        : selectedMethod === 'qr'
          ? 'Scan with your phone, finish signing in there, then enter the return code here.'
          : optionsOpen
            ? 'Choose another way to finish signing in.'
            : 'Continue in your browser, then return to Jovie.';

  return { copyLabel, openLabel, statusText, supportingCopy };
}

export function DesktopAuthHandoffActions({
  authUrl = null,
  onOpenStateChange,
  resolveAuthUrl,
  showCancelSignIn = false,
  showTouchId = false,
}: DesktopAuthHandoffActionsProps) {
  const [openState, setOpenState] = useState<DesktopAuthOpenState>('idle');
  const [openError, setOpenError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const [copyError, setCopyError] = useState<string | null>(null);
  const [stillWaiting, setStillWaiting] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<SelectedMethod>(() =>
    showTouchId ? 'touch-id' : 'browser'
  );
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [returnCode, setReturnCode] = useState('');
  const [redeemState, setRedeemState] = useState<RedeemState>('idle');
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [canRedeemCode, setCanRedeemCode] = useState(false);
  const [touchIdState, setTouchIdState] = useState<TouchIdState>('idle');
  const optionsId = useId();
  const statusId = useId();
  const primaryActionRef = useRef<HTMLButtonElement>(null);
  const touchIdPrimaryRef = useRef<HTMLButtonElement>(null);
  const optionsDisclosureRef = useRef<HTMLButtonElement>(null);
  const copyOptionRef = useRef<HTMLButtonElement>(null);
  const codeOptionRef = useRef<HTMLButtonElement>(null);
  const qrOptionRef = useRef<HTMLButtonElement>(null);
  const browserOptionRef = useRef<HTMLButtonElement>(null);
  const touchIdOptionRef = useRef<HTMLButtonElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const qrInstructionsRef = useRef<HTMLDivElement>(null);
  const returnFocusMethodRef = useRef<SelectedMethod | 'copy'>(
    showTouchId ? 'browser' : 'copy'
  );
  const returnBaseMethodRef = useRef<SelectedMethod>(
    showTouchId ? 'touch-id' : 'browser'
  );
  const focusBaseActionRef = useRef(false);

  useEffect(() => {
    setCanRedeemCode(supportsDesktopAuthReturnCode());
  }, []);

  useEffect(() => {
    if (selectedMethod === 'code') {
      codeInputRef.current?.focus();
      return;
    }
    if (selectedMethod === 'qr') {
      qrInstructionsRef.current?.focus();
      return;
    }
    if (!optionsOpen) {
      if (!focusBaseActionRef.current) return;
      focusBaseActionRef.current = false;
      if (selectedMethod === 'touch-id') {
        touchIdPrimaryRef.current?.focus();
      } else {
        primaryActionRef.current?.focus();
      }
      return;
    }
    const target =
      returnFocusMethodRef.current === 'code'
        ? codeOptionRef.current
        : returnFocusMethodRef.current === 'qr'
          ? qrOptionRef.current
          : returnFocusMethodRef.current === 'browser'
            ? browserOptionRef.current
            : returnFocusMethodRef.current === 'touch-id'
              ? touchIdOptionRef.current
              : copyOptionRef.current;
    target?.focus();
  }, [optionsOpen, selectedMethod]);

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

  // The QR encodes the same link "Copy Sign-in Link" copies. The PKCE
  // challenge inside is public, the verifier never leaves the app.
  useEffect(() => {
    if (selectedMethod !== 'qr' || qrSvg || qrError) return;
    const currentAuthUrl = getAuthUrl();
    if (!currentAuthUrl) {
      setQrError(
        'The QR code could not be created. Choose another sign-in option.'
      );
      return;
    }
    let cancelled = false;
    void import('@/lib/utils/qr-code')
      .then(({ generateQrCodeSvg }) =>
        generateQrCodeSvg(currentAuthUrl, QR_CODE_SIZE)
      )
      .then(svg => {
        if (!cancelled) setQrSvg(svg);
      })
      .catch(() => {
        if (!cancelled) {
          setQrError(
            'The QR code could not be created. Choose another sign-in option.'
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedMethod, qrSvg, qrError, getAuthUrl]);

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
    setTouchIdState('idle');
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

  const signInWithTouchId = useCallback(async () => {
    if (touchIdState === 'working' || touchIdState === 'signed-in') return;
    setTouchIdState('working');
    try {
      // Loaded on demand so browser handoff stays light.
      const { authClient } = await import('@/lib/auth/client');
      const signedIn = await authClient.signIn.passkey();
      if (signedIn?.error) throw new Error(signedIn.error.message);
      const completed = await completeDesktopPasskeySignIn();
      if (!completed.ok) throw new Error(completed.reason);
      setTouchIdState('signed-in');
    } catch {
      setTouchIdState('error');
      returnBaseMethodRef.current = 'browser';
      focusBaseActionRef.current = true;
      setOptionsOpen(false);
      setSelectedMethod('browser');
    }
  }, [touchIdState]);

  const selectBrowserMethod = useCallback(() => {
    returnBaseMethodRef.current = 'browser';
    focusBaseActionRef.current = true;
    setOptionsOpen(false);
    setSelectedMethod('browser');
  }, []);

  const selectTouchIdMethod = useCallback(() => {
    setTouchIdState('idle');
    returnBaseMethodRef.current = 'touch-id';
    focusBaseActionRef.current = true;
    setOptionsOpen(false);
    setSelectedMethod('touch-id');
  }, []);

  const selectCodeMethod = useCallback(() => {
    if (selectedMethod === 'browser' || selectedMethod === 'touch-id') {
      returnBaseMethodRef.current = selectedMethod;
    }
    returnFocusMethodRef.current = 'code';
    setOptionsOpen(false);
    setSelectedMethod('code');
  }, [selectedMethod]);

  const selectQrMethod = useCallback(() => {
    if (selectedMethod === 'browser' || selectedMethod === 'touch-id') {
      returnBaseMethodRef.current = selectedMethod;
    }
    returnFocusMethodRef.current = 'qr';
    setOptionsOpen(false);
    setQrSvg(null);
    setQrError(null);
    setSelectedMethod('qr');
  }, [selectedMethod]);

  const returnToOptions = useCallback(() => {
    setSelectedMethod(returnBaseMethodRef.current);
    setOptionsOpen(true);
  }, []);

  useEffect(() => {
    if (!optionsOpen) return;
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setOptionsOpen(false);
      optionsDisclosureRef.current?.focus();
    };
    globalThis.document.addEventListener('keydown', handleEscape);
    return () =>
      globalThis.document.removeEventListener('keydown', handleEscape);
  }, [optionsOpen]);

  const cancelSignIn = useCallback(() => {
    void closeDesktopAuthWindow().catch(() => undefined);
  }, []);

  const hasAuthUrl = authUrl !== null || resolveAuthUrl !== undefined;
  const isBusy = openState === 'opening' || copyState === 'copying';
  const { copyLabel, openLabel, statusText, supportingCopy } =
    getDesktopAuthPresentation({
      copyError,
      copyState,
      openError,
      openState,
      optionsOpen,
      qrError,
      qrReady: qrSvg !== null,
      redeemError,
      redeemState,
      selectedMethod,
      stillWaiting,
      touchIdState,
    });
  const cancelButton = showCancelSignIn ? (
    <DesktopAuthCancelButton onCancel={cancelSignIn} />
  ) : null;

  return (
    <div
      className='flex w-full flex-col items-center'
      data-auth-selected-method={selectedMethod}
      data-testid='desktop-auth-hierarchy'
    >
      <DesktopAuthHeading copy={supportingCopy} />
      {selectedMethod === 'code' ? (
        <DesktopAuthCodeForm
          cancelButton={cancelButton}
          inputRef={codeInputRef}
          onBack={returnToOptions}
          onReturnCodeChange={value => {
            setReturnCode(normalizeReturnCodeInput(value));
            if (redeemState === 'error') {
              setRedeemState('idle');
              setRedeemError(null);
            }
          }}
          onSubmit={submitReturnCode}
          redeemState={redeemState}
          returnCode={returnCode}
          statusId={statusId}
        />
      ) : selectedMethod === 'qr' ? (
        <section
          ref={qrInstructionsRef}
          aria-label='Phone Sign-in Instructions'
          className='mt-5 flex w-full flex-col items-center justify-center gap-4 focus-visible:outline-none'
          data-desktop-auth-state={
            qrError ? 'qr-error' : qrSvg ? 'qr' : 'qr-loading'
          }
          data-testid='desktop-auth-qr'
          tabIndex={-1}
        >
          {qrSvg ? (
            <div
              aria-label='QR Code With Your Sign-in Link'
              className='rounded-xl bg-white p-3 dark:bg-white [&_svg]:block'
              // biome-ignore lint/security/noDangerouslySetInnerHtml: generateQrCodeSvg emits a static QR matrix; the auth URL is data, never markup
              dangerouslySetInnerHTML={{ __html: qrSvg }}
              role='img'
            />
          ) : null}
          <div className='flex flex-wrap items-center justify-center gap-x-4 gap-y-4'>
            {canRedeemCode ? (
              <Button
                type='button'
                variant='link'
                size='sm'
                onClick={selectCodeMethod}
              >
                Enter A Code
              </Button>
            ) : null}
            <Button
              type='button'
              variant='link'
              size='sm'
              onClick={returnToOptions}
            >
              Back To Sign-in Options
            </Button>
            {cancelButton}
          </div>
        </section>
      ) : (
        <div
          className='mt-5 flex w-full flex-col items-center justify-center gap-4'
          data-desktop-auth-state={
            selectedMethod === 'touch-id'
              ? `touch-id-${touchIdState}`
              : openState
          }
          data-testid='desktop-auth-actions'
        >
          {selectedMethod === 'touch-id' ? (
            <DesktopAuthTouchIdButton
              ref={touchIdPrimaryRef}
              state={touchIdState}
              onClick={signInWithTouchId}
            />
          ) : (
            <Button
              ref={primaryActionRef}
              type='button'
              variant='primary'
              size='md'
              className='w-full'
              data-auth-action='primary'
              disabled={!hasAuthUrl || isBusy}
              onClick={openAuthUrl}
            >
              {openLabel}
            </Button>
          )}
          <DesktopAuthMethodOptions
            cancelButton={cancelButton}
            browserOptionRef={browserOptionRef}
            canRedeemCode={canRedeemCode}
            codeOptionRef={codeOptionRef}
            copyLabel={copyLabel}
            copyOptionRef={copyOptionRef}
            disabled={!hasAuthUrl || isBusy}
            disclosureRef={optionsDisclosureRef}
            onCopy={copyAuthUrl}
            onSelectBrowser={selectBrowserMethod}
            onSelectCode={selectCodeMethod}
            onSelectQr={selectQrMethod}
            onSelectTouchId={selectTouchIdMethod}
            onToggle={() => {
              returnFocusMethodRef.current =
                selectedMethod === 'touch-id'
                  ? 'browser'
                  : showTouchId
                    ? 'touch-id'
                    : 'copy';
              setOptionsOpen(current => !current);
            }}
            open={optionsOpen}
            optionsId={optionsId}
            qrOptionRef={qrOptionRef}
            selectedMethod={selectedMethod}
            showTouchId={showTouchId}
            touchIdOptionRef={touchIdOptionRef}
          />
        </div>
      )}
      <DesktopAuthStatus
        id={statusId}
        text={hasAuthUrl ? statusText : 'Start sign-in again from Jovie.'}
      />
    </div>
  );
}

export function DesktopAuthClient({
  authUrlParam,
  touchIdHint = false,
}: DesktopAuthClientProps) {
  useDesktopAppBootSignal();
  const [openState, setOpenState] = useState<DesktopAuthOpenState>('idle');
  const appOrigin = getAppOrigin();
  const authUrl = useMemo(
    () => sanitizeDesktopAuthUrl(authUrlParam, appOrigin),
    [authUrlParam, appOrigin]
  );

  return (
    <MacCinematicSurface state={openState} testId='desktop-auth-handoff'>
      <section className='relative z-10 flex w-full max-w-90 flex-col items-center px-6 py-4 text-center'>
        <DesktopAuthHandoffActions
          authUrl={authUrl}
          onOpenStateChange={setOpenState}
          showCancelSignIn
          showTouchId={touchIdHint}
        />
      </section>
    </MacCinematicSurface>
  );
}
