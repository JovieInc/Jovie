'use client';

import { Button } from '@jovie/ui';
import { Fingerprint } from 'lucide-react';
import { useState } from 'react';
import {
  isDesktopEnvironment,
  openCurrentOvieInBrowser,
} from '@/lib/desktop/electron-bridge';
import { unlockWithPasskey } from '@/lib/workspace-lock/unlock-with-passkey';
import { clearWorkspaceLock } from '@/lib/workspace-lock/workspace-lock';

type Status = 'idle' | 'working' | 'error';

/**
 * Ovie's optional privacy lock replaces private content while locked. The
 * fingerprint and its label share one accessible action; success is displayed
 * only after the server confirms the privacy unlock receipt.
 */
export function WorkspaceLockScreen() {
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [openingBrowser, setOpeningBrowser] = useState(false);

  async function unlock() {
    setStatus('working');
    setMessage(null);
    try {
      await unlockWithPasskey({ purpose: 'privacy' });
      clearWorkspaceLock();
      window.location.reload();
    } catch (error) {
      setStatus('error');
      setMessage(
        error instanceof Error && error.message
          ? error.message
          : 'Passkey check did not complete.'
      );
    }
  }

  async function continueInBrowser() {
    setOpeningBrowser(true);
    try {
      const result = await openCurrentOvieInBrowser();
      setMessage(
        result.ok
          ? 'Continue in your browser. This desktop session stays locked.'
          : 'Could not open your browser. Update the desktop app or open Ovie in your browser.'
      );
    } finally {
      setOpeningBrowser(false);
    }
  }

  return (
    <div
      role='status'
      data-workspace-lock='true'
      className='flex h-full min-h-1/2 w-full flex-col items-center justify-center gap-4 px-6'
    >
      <h1 className='text-base font-medium text-primary-token'>
        Ovie Is Locked
      </h1>
      <p className='text-sm text-secondary-token'>
        Verify it&apos;s you to continue.
      </p>
      <Button
        variant='primary'
        type='button'
        onClick={unlock}
        disabled={status === 'working' || openingBrowser}
      >
        <Fingerprint
          aria-hidden='true'
          data-testid='workspace-lock-glyph'
          className='mr-2 h-4 w-4'
        />
        {status === 'working' ? 'Waiting for passkey…' : 'Unlock with passkey'}
      </Button>
      {message ? (
        <p
          role='alert'
          className='min-h-12 max-w-sm text-center text-xs text-secondary-token'
        >
          {message}
        </p>
      ) : null}
      {status === 'error' && isDesktopEnvironment() ? (
        <Button
          variant='tertiary'
          type='button'
          className='min-w-40'
          onClick={continueInBrowser}
          disabled={openingBrowser}
        >
          {openingBrowser ? 'Opening browser…' : 'Continue in browser'}
        </Button>
      ) : null}
    </div>
  );
}
