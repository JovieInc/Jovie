'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from '@/components/organisms/Dialog';
import { type Consent, saveConsent } from '@/lib/cookies/consent';

interface CookieModalProps {
  open: boolean;
  onClose: () => void;
  onSave?: (consent: Consent) => void;
}

export function CookieModal({ open, onClose, onSave }: CookieModalProps) {
  const [settings, setSettings] = useState<Consent>({
    essential: true,
    analytics: false,
    marketing: false,
  });

  const toggle = (key: keyof Consent) => {
    if (key === 'essential') return;
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const save = async () => {
    await saveConsent(settings);
    onSave?.(settings);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size='sm'
      className='mx-4 max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] sm:mx-auto sm:w-full'
    >
      <DialogTitle className='text-lg font-semibold'>
        Cookie preferences
      </DialogTitle>

      <DialogBody className='mt-4 space-y-3'>
        <label className='flex items-center justify-between gap-4 py-1'>
          <span className='text-sm sm:text-base'>Essential</span>
          <input
            type='checkbox'
            checked
            disabled
            className='h-5 w-5 shrink-0'
          />
        </label>
        <label className='flex items-center justify-between gap-4 py-1'>
          <span className='text-sm sm:text-base'>Analytics</span>
          <input
            type='checkbox'
            className='h-5 w-5 shrink-0 cursor-pointer'
            checked={settings.analytics}
            onChange={() => toggle('analytics')}
          />
        </label>
        <label className='flex items-center justify-between gap-4 py-1'>
          <span className='text-sm sm:text-base'>Marketing</span>
          <input
            type='checkbox'
            className='h-5 w-5 shrink-0 cursor-pointer'
            checked={settings.marketing}
            onChange={() => toggle('marketing')}
          />
        </label>
      </DialogBody>

      <DialogActions className='mt-6'>
        <button
          type='button'
          onClick={onClose}
          className='rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800'
        >
          Cancel
        </button>
        <button
          type='button'
          onClick={save}
          className='rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-100'
        >
          Save preferences
        </button>
      </DialogActions>
    </Dialog>
  );
}
