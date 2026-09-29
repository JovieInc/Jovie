'use client';

import { Button } from '@jovie/ui';
import { Fingerprint } from 'lucide-react';
import { useState } from 'react';
import { isDesktopEnvironment } from '@/lib/desktop/electron-bridge';
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

  return (
    <div
      role='status'
      data-workspace-lock='true'
      className='flex h-full min-h-1/2 w-full flex-col items-center justify-center gap-4 px-6'
    >
      <div
        aria-hidden='true'
        className='flex h-16 w-16 items-center justify-center rounded-full border border-subtle bg-surface-1 text-destructive'
      >
        <Fingerprint className='h-8 w-8' />
      </div>
      <Button
        variant='tertiary'
        type='button'
        onClick={unlock}
        disabled={status === 'working'}
      >
        {status === 'working' ? 'Waiting for passkey…' : 'Unlock to continue'}
      </Button>
      {message ? (
        <p role='alert' className='text-sm text-destructive'>
          {message}
        </p>
      ) : null}
      {status === 'error' && isDesktopEnvironment() ? (
        <Button
          variant='tertiary'
          type='button'
          onClick={() =>
            window.open(window.location.href, '_blank', 'noopener,noreferrer')
          }
        >
          Open In Browser
        </Button>
      ) : null}
    </div>
  );
}
