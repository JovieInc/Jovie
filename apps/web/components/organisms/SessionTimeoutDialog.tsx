'use client';

import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { Button } from '@jovie/ui';
import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/components/organisms/Dialog';
import { useSessionTimeout } from '@/lib/hooks/useSessionTimeout';
import { formatDuration, formatRelativeTimeFromNow } from '@/lib/utils/time';

export function SessionTimeoutDialog() {
  const {
    warningVisible,
    countdownMs,
    extendSession,
    saveDrafts,
    isExtending,
    isSavingDrafts,
    lastSave,
    autoSaveError,
    draftSourceCount,
  } = useSessionTimeout();
  const [manualSaveMessage, setManualSaveMessage] = useState<string | null>(
    null
  );
  const [manualSaveError, setManualSaveError] = useState<string | null>(null);

  if (!warningVisible) {
    return null;
  }

  const countdownLabel = formatDuration(countdownMs ?? 0);
  const lastSaveLabel = lastSave
    ? `${lastSave.reason === 'auto' ? 'Auto-saved' : 'Saved'} ${formatRelativeTimeFromNow(lastSave.at)}`
    : 'Auto-save pending';
  const disableManualSave = draftSourceCount === 0;

  const statusMessage = useMemo(() => {
    if (manualSaveError) return manualSaveError;
    if (manualSaveMessage) return manualSaveMessage;
    if (autoSaveError) return autoSaveError;
    return lastSaveLabel;
  }, [autoSaveError, lastSaveLabel, manualSaveError, manualSaveMessage]);

  const handleManualSave = async () => {
    if (disableManualSave) return;
    setManualSaveMessage(null);
    setManualSaveError(null);
    try {
      const saved = await saveDrafts({
        force: true,
        reason: 'manual',
        trackState: true,
      });
      if (saved > 0) {
        setManualSaveMessage('Draft saved to this browser');
      } else {
        setManualSaveMessage('No new changes to save');
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to save draft right now';
      setManualSaveError(message);
    }
  };

  return (
    <Dialog
      open
      onClose={() => {
        // Keep modal open until user takes action
      }}
      hideClose
      size='md'
    >
      <div className='flex items-start gap-4'>
        <div className='rounded-full bg-amber-500/15 p-2 text-amber-600 dark:text-amber-400'>
          <ExclamationTriangleIcon className='h-6 w-6' aria-hidden='true' />
        </div>
        <div className='flex-1 space-y-1'>
          <DialogTitle>Session expiring soon</DialogTitle>
          <DialogDescription>
            For security, we sign you out after a period of inactivity. Extend
            your session to keep editing without disruption.
          </DialogDescription>
        </div>
        <div
          className='min-w-[4.5rem] text-right font-mono text-lg font-semibold text-primary-token'
          aria-label='Time remaining'
        >
          {countdownLabel}
        </div>
      </div>

      <DialogBody className='space-y-4'>
        <p className='text-sm text-secondary-token'>
          We automatically store unsaved drafts on this device so you can pick
          up where you left off next time you sign in.
        </p>
        <ul className='space-y-2 rounded-lg border border-subtle bg-surface-1/60 p-3 text-sm'>
          <li className='flex items-center justify-between gap-3'>
            <span className='text-secondary-token'>Draft auto-save</span>
            <span className='font-medium text-primary-token'>
              {statusMessage}
            </span>
          </li>
          <li className='flex items-center justify-between gap-3 text-xs text-secondary-token'>
            <span>Storage scope</span>
            <span>This browser only</span>
          </li>
        </ul>
        {disableManualSave && (
          <p className='text-xs text-secondary-token'>
            Open a dashboard editor to enable draft saves.
          </p>
        )}
      </DialogBody>

      <DialogActions>
        <Button
          type='button'
          variant='secondary'
          disabled={disableManualSave}
          loading={isSavingDrafts}
          onClick={handleManualSave}
        >
          Save Draft
        </Button>
        <Button
          type='button'
          variant='primary'
          loading={isExtending}
          onClick={extendSession}
        >
          Extend Session
        </Button>
      </DialogActions>
    </Dialog>
  );
}
