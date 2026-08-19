'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Label,
  Textarea,
} from '@jovie/ui';
import { useState } from 'react';

export interface FlagChangeConfirmRequest {
  readonly title: string;
  readonly description: string;
}

/**
 * Confirmation flow required for production flag changes (toggles, resets,
 * and rollbacks). Captures a mandatory reason that is stored on the audit
 * event. Shared by the features table and the audit section so prod changes
 * always go through the same gate.
 */
export function FlagChangeConfirmDialog({
  request,
  open,
  onOpenChange,
  onConfirm,
}: Readonly<{
  request: FlagChangeConfirmRequest | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => Promise<void>;
}>) {
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);

  const trimmed = reason.trim();

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setReason('');
      setPending(false);
    }
    onOpenChange(next);
  };

  const handleConfirm = async () => {
    if (!trimmed) return;
    setPending(true);
    try {
      await onConfirm(trimmed);
      handleOpenChange(false);
    } catch {
      // onConfirm surfaces its own error (toast); keep the dialog open so the
      // operator can retry or cancel.
    } finally {
      setPending(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className='max-w-md'>
        <AlertDialogHeader>
          <AlertDialogTitle className='text-base font-semibold text-primary-token'>
            {request?.title ?? 'Confirm production change'}
          </AlertDialogTitle>
          <AlertDialogDescription className='text-sm text-secondary-token'>
            {request?.description ??
              'This changes a runtime feature flag in production.'}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className='space-y-2'>
          <Label htmlFor='flag-change-reason'>Reason (Required)</Label>
          <Textarea
            id='flag-change-reason'
            value={reason}
            onChange={event => setReason(event.target.value)}
            placeholder='Why is this change being made?'
            rows={3}
            maxLength={500}
            disabled={pending}
            data-testid='flag-change-reason'
          />
          <p className='text-xs text-tertiary-token'>
            Stored on the audit event for this change.
          </p>
        </div>

        <AlertDialogFooter className='gap-2 sm:gap-2'>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={event => {
              event.preventDefault();
              void handleConfirm();
            }}
            disabled={pending || !trimmed}
          >
            {pending ? 'Applying…' : 'Confirm change'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
