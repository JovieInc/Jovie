'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from '@/components/organisms/Dialog';
import { type Consent } from '@/lib/cookies/consent';
import { saveConsentClient } from '@/lib/cookies/consent-client';

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
    await saveConsentClient(settings);
    onSave?.(settings);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} size='md'>
      <div className='w-full max-w-md rounded bg-white p-6 text-gray-900 shadow-lg dark:bg-gray-900 dark:text-gray-100'>
        <DialogTitle className='text-lg font-semibold'>
          Cookie preferences
        </DialogTitle>

        <DialogBody className='mt-4 space-y-2'>
          <label className='flex items-center justify-between'>
            <span>Essential</span>
            <input type='checkbox' checked disabled className='h-4 w-4' />
          </label>
          <label className='flex items-center justify-between'>
            <span>Analytics</span>
            <input
              type='checkbox'
              className='h-4 w-4'
              checked={settings.analytics}
              onChange={() => toggle('analytics')}
            />
          </label>
          <label className='flex items-center justify-between'>
            <span>Marketing</span>
            <input
              type='checkbox'
              className='h-4 w-4'
              checked={settings.marketing}
              onChange={() => toggle('marketing')}
            />
          </label>
        </DialogBody>

        <DialogActions className='mt-6 flex justify-end gap-2'>
          <button
            type='button'
            onClick={onClose}
            className='rounded border px-4 py-2 text-sm'
          >
            Cancel
          </button>
          <button
            type='button'
            onClick={save}
            className='rounded bg-black px-4 py-2 text-sm text-white dark:bg-white dark:text-black'
          >
            Save
          </button>
        </DialogActions>
      </div>
    </Dialog>
  );
}
