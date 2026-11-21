'use client';

import { Button, Input } from '@jovie/ui';
import { Check, Copy, Link2, Wallet } from 'lucide-react';
import { memo } from 'react';
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/components/organisms/Dialog';
import { CopyToClipboardButton } from '@/features/dashboard/molecules/CopyToClipboardButton';

export interface VenmoEditFormProps {
  readonly venmoHandle: string;
  readonly onVenmoHandleChange: (value: string) => void;
  readonly onSave: () => void;
  readonly onCancel: () => void;
  readonly isSaving: boolean;
}

export const VenmoEditForm = memo(function VenmoEditForm({
  venmoHandle,
  onVenmoHandleChange,
  onSave,
  onCancel,
  isSaving,
}: VenmoEditFormProps) {
  return (
    <div className='space-y-3'>
      <div className='flex items-center gap-2'>
        <span className='text-app text-secondary-token'>@</span>
        <Input
          type='text'
          value={venmoHandle}
          onChange={e => onVenmoHandleChange(e.target.value)}
          placeholder='your-username'
          className='h-8 min-w-0 flex-1'
        />
      </div>
      <div className='flex items-center gap-2'>
        <Button
          onClick={onSave}
          disabled={isSaving || !venmoHandle.trim()}
          variant='secondary'
          size='sm'
        >
          {isSaving ? 'Saving…' : 'Save'}
        </Button>
        <Button
          onClick={onCancel}
          disabled={isSaving}
          variant='ghost'
          size='sm'
        >
          Cancel
        </Button>
      </div>
    </div>
  );
});

export interface VenmoConnectDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly venmoHandle: string;
  readonly onVenmoHandleChange: (value: string) => void;
  readonly onSave: () => void;
  readonly isSaving: boolean;
  readonly saveSuccess: string | null;
}

export const VenmoConnectDialog = memo(function VenmoConnectDialog({
  open,
  onClose,
  venmoHandle,
  onVenmoHandleChange,
  onSave,
  isSaving,
  saveSuccess,
}: VenmoConnectDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} size='sm'>
      <div className='flex items-start gap-3'>
        <div
          className='flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-accent/20 bg-accent/10'
          aria-hidden='true'
        >
          <Wallet className='h-4 w-4 text-accent-token' />
        </div>
        <div className='min-w-0 flex-1'>
          <DialogTitle className='text-mid font-semibold tracking-[-0.011em] text-primary-token'>
            Connect Venmo
          </DialogTitle>
          <DialogDescription className='mt-0.5 text-app leading-5 text-secondary-token'>
            Link your Venmo to start receiving payments from fans.
          </DialogDescription>
        </div>
      </div>

      <DialogBody>
        <div className='space-y-3'>
          <div>
            <label
              htmlFor='venmo-handle'
              className='mb-1.5 block text-app font-caption text-secondary-token'
            >
              Venmo Username
            </label>
            <div className='flex items-center gap-2'>
              <span className='text-app text-tertiary-token'>@</span>
              <Input
                type='text'
                id='venmo-handle'
                value={venmoHandle}
                onChange={e => onVenmoHandleChange(e.target.value)}
                placeholder='your-username'
                className='flex-1'
              />
            </div>
          </div>
          <div className='flex items-center gap-2'>
            <Button
              onClick={onSave}
              disabled={isSaving || !venmoHandle.trim()}
              variant='secondary'
              size='sm'
            >
              {isSaving ? 'Connecting…' : 'Connect'}
            </Button>
            <Button
              onClick={onClose}
              disabled={isSaving}
              variant='ghost'
              size='sm'
            >
              Cancel
            </Button>
          </div>
          {saveSuccess && (
            <output
              className='flex items-center gap-2 rounded-lg border border-subtle bg-surface-1 px-3 py-2 text-app font-caption text-success'
              aria-live='polite'
            >
              <Check className='h-3.5 w-3.5' />
              {saveSuccess}
            </output>
          )}
        </div>
      </DialogBody>
    </Dialog>
  );
});

export interface TipLinkSectionProps {
  readonly tipUrl: string;
  readonly tipRelativePathLink: string;
}

export const TipLinkSection = memo(function TipLinkSection({
  tipUrl,
  tipRelativePathLink,
}: TipLinkSectionProps) {
  return (
    <div>
      <div className='mb-3 flex items-center gap-2'>
        <div
          className='flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-subtle bg-surface-1'
          aria-hidden='true'
        >
          <Link2 className='h-3.5 w-3.5 text-tertiary-token' />
        </div>
        <h2 className='text-app font-caption text-primary-token'>Pay Link</h2>
      </div>

      <div className='flex items-center gap-2 rounded-lg border border-subtle bg-surface-0 px-3 py-2.5'>
        <Copy className='max-sm:hidden h-3.5 w-3.5 shrink-0 text-tertiary-token' />
        <span className='min-w-0 flex-1 truncate text-app text-secondary-token'>
          {tipUrl}
        </span>
        <CopyToClipboardButton
          relativePath={tipRelativePathLink}
          idleLabel='Copy'
          successLabel='Copied'
          errorLabel='Failed'
          className='h-7 shrink-0 px-2.5 text-app'
        />
      </div>
      <p className='mt-2 text-2xs text-tertiary-token sm:text-app'>
        Share this link anywhere to receive payments.
      </p>
    </div>
  );
});
