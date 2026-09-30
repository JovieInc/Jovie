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
 * Full-area workspace lock (JOV-6829). Replaces the entire main content area
 * while the workspace is locked: a red fingerprint dead center with
 * "Unlock to continue". Clicking either runs the passkey / Touch ID step-up;
 * on success the lock cookie clears and the content renders after reload.
 */
export function WorkspaceLockScreen() {
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [openingBrowser, setOpeningBrowser] = useState(false);

  async function unlock() {
    setStatus('working');
    setMessage(null);
    try {
      await unlockWithPasskey();
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
      <Fingerprint
        aria-hidden='true'
        data-testid='workspace-lock-glyph'
        className='h-8 w-8 text-tertiary-token opacity-60'
      />
      <Button
        variant='tertiary'
        type='button'
        onClick={unlock}
        disabled={status === 'working' || openingBrowser}
      >
        {status === 'working' ? 'Waiting for passkey…' : 'Unlock to continue'}
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
