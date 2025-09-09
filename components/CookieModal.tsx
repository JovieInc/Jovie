'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { type Consent, saveConsent } from '@/lib/cookies/consent';

interface CookieModalProps {
  open: boolean;
  onClose: () => void;
  onSave?: (consent: Consent) => void;
}

export default function CookieModal({
  open,
  onClose,
  onSave,
}: CookieModalProps) {
  const [settings, setSettings] = useState<Consent>({
    essential: true,
    analytics: false,
    marketing: false,
  });

  const toggle = (key: keyof Consent) => {
    if (key === 'essential') return;
    setSettings({ ...settings, [key]: !settings[key] });
  };

  const save = async () => {
    await saveConsent(settings);
    onSave?.(settings);
    onClose();
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className='w-full max-w-md rounded bg-white p-6 text-gray-900 shadow-lg dark:bg-gray-900 dark:text-gray-100'>
        <DialogHeader>
          <DialogTitle>Cookie preferences</DialogTitle>
        </DialogHeader>

        <div className='mt-4 space-y-2'>
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
        </div>

        <DialogFooter className='mt-6 flex justify-end gap-2'>
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
