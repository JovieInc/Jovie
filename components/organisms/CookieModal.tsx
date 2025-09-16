'use client';

import { Dialog, Transition } from '@headlessui/react';
import { Fragment, useState } from 'react';
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

  return (
    <Transition show={open} as={Fragment}>
      <Dialog
        onClose={onClose}
        className='fixed inset-0 z-50'
        aria-label='Cookie preferences'
      >
        <div className='flex min-h-screen items-center justify-center p-4'>
          <Transition.Child
            as={Fragment}
            enter='ease-out duration-200'
            enterFrom='opacity-0'
            enterTo='opacity-100'
            leave='ease-in duration-150'
            leaveFrom='opacity-100'
            leaveTo='opacity-0'
          >
            <div className='fixed inset-0 bg-black/50' />
          </Transition.Child>

          <Transition.Child
            as={Fragment}
            enter='ease-out duration-200'
            enterFrom='opacity-0 scale-95'
            enterTo='opacity-100 scale-100'
            leave='ease-in duration-150'
            leaveFrom='opacity-100 scale-100'
            leaveTo='opacity-0 scale-95'
          >
            <Dialog.Panel className='w-full max-w-md rounded bg-white p-6 text-gray-900 shadow-lg dark:bg-gray-900 dark:text-gray-100'>
              <Dialog.Title className='text-lg font-semibold'>
                Cookie preferences
              </Dialog.Title>

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

              <div className='mt-6 flex justify-end gap-2'>
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
              </div>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  );
}
