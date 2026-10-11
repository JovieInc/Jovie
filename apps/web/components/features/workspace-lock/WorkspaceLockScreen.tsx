'use client';

import { Button } from '@jovie/ui';
import { ExternalLink, KeyRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  isDesktopEnvironment,
  openCurrentOvieInBrowser,
} from '@/lib/desktop/electron-bridge';
import {
  PasskeyStepUpError,
  type PasskeyStepUpErrorCode,
  unlockWithPasskey,
} from '@/lib/workspace-lock/unlock-with-passkey';
import { clearWorkspaceLock } from '@/lib/workspace-lock/workspace-lock';

type Status = 'idle' | 'working' | 'error';

/** One anchored action; feedback never participates in its centering. */
export function WorkspaceLockScreen() {
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<PasskeyStepUpErrorCode | null>(
    null
  );
  const attempt = useRef<AbortController | null>(null);
  const browserRecovery = errorCode === 'unsupported' && isDesktopEnvironment();

  useEffect(
    () => () => {
      attempt.current?.abort();
      attempt.current = null;
    },
    []
  );

  async function activate() {
    // The ref closes the gap before React commits the disabled state.
    if (attempt.current) return;
    const owner = new AbortController();
    attempt.current = owner;
    setStatus('working');
    setMessage(null);
    try {
      if (browserRecovery) {
        const result = await openCurrentOvieInBrowser();
        if (attempt.current !== owner || owner.signal.aborted) return;
        setMessage(
          result.ok
            ? 'Continue in your browser. This desktop session stays locked.'
            : 'Could not open your browser. Open Ovie in your browser, or try again.'
        );
        setStatus('error');
      } else {
        await unlockWithPasskey({ purpose: 'privacy', signal: owner.signal });
        if (attempt.current !== owner || owner.signal.aborted) return;
        clearWorkspaceLock();
        window.location.reload();
      }
    } catch (error) {
      if (attempt.current !== owner || owner.signal.aborted) return;
      setStatus('error');
      setErrorCode(
        error instanceof PasskeyStepUpError ? error.code : 'unconfirmed'
      );
      setMessage(
        error instanceof Error && error.message
          ? error.message
          : 'Could not confirm the unlock. Try again.'
      );
    } finally {
      if (attempt.current === owner) attempt.current = null;
    }
  }

  const label = browserRecovery
    ? status === 'working'
      ? 'Opening browser…'
      : 'Continue in browser'
    : status === 'working'
      ? 'Waiting for passkey…'
      : 'Unlock with passkey';
  const Glyph = browserRecovery ? ExternalLink : KeyRound;

  return (
    <section
      data-workspace-lock='true'
      aria-label='Ovie Privacy Lock'
      className='flex h-full min-h-1/2 w-full items-center justify-center px-6'
    >
      <div
        data-workspace-lock-anchor='true'
        className='relative flex w-full max-w-sm justify-center'
      >
        <Button
          variant='tertiary'
          type='button'
          className='min-w-52'
          onClick={activate}
          disabled={status === 'working'}
          aria-describedby='workspace-lock-status'
          aria-busy={status === 'working'}
        >
          <Glyph
            aria-hidden='true'
            data-testid='workspace-lock-glyph'
            className='mr-2 h-4 w-4'
          />
          {label}
        </Button>
        <div
          id='workspace-lock-status'
          data-testid='workspace-lock-status'
          className='absolute top-full w-full min-h-12 pt-4 text-center text-xs text-secondary-token'
        >
          <p
            role={status === 'error' ? 'alert' : 'status'}
            aria-atomic='true'
            className='text-xs text-secondary-token'
          >
            {message}
          </p>
        </div>
      </div>
    </section>
  );
}
