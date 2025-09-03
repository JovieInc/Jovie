'use client';

import { ClerkLoaded, ClerkLoading, UserProfile } from '@clerk/nextjs';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { Fragment } from 'react';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { track } from '@/lib/analytics';

interface AccountSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AccountSettingsModal({
  isOpen,
  onClose,
}: AccountSettingsModalProps) {
  const handleClose = () => {
    track('settings_account_modal_close');
    onClose();
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as='div' className='relative z-50' onClose={handleClose}>
        <Transition.Child
          as={Fragment}
          enter='ease-out duration-300'
          enterFrom='opacity-0'
          enterTo='opacity-100'
          leave='ease-in duration-200'
          leaveFrom='opacity-100'
          leaveTo='opacity-0'
        >
          <div className='fixed inset-0 bg-black/25 backdrop-blur-sm' />
        </Transition.Child>

        <div className='fixed inset-0 overflow-y-auto'>
          <div className='flex min-h-full items-center justify-center p-4 text-center'>
            <Transition.Child
              as={Fragment}
              enter='ease-out duration-300'
              enterFrom='opacity-0 scale-95'
              enterTo='opacity-100 scale-100'
              leave='ease-in duration-200'
              leaveFrom='opacity-100 scale-100'
              leaveTo='opacity-0 scale-95'
            >
              <Dialog.Panel className='relative w-full max-w-3xl transform bg-transparent p-0 shadow-none text-left transition-all'>
                <button
                  type='button'
                  className='absolute -top-2 -right-2 rounded-md p-1 text-secondary-token hover:text-primary-token hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1'
                  onClick={handleClose}
                >
                  <span className='sr-only'>Close</span>
                  <XMarkIcon className='h-5 w-5' aria-hidden='true' />
                </button>

                <ClerkLoading>
                  <div className='space-y-4 bg-transparent p-0'>
                    <LoadingSkeleton height='h-6' width='w-1/3' />
                    <LoadingSkeleton height='h-10' />
                    <LoadingSkeleton height='h-10' />
                    <LoadingSkeleton height='h-10' />
                    <LoadingSkeleton height='h-10' />
                    <LoadingSkeleton height='h-10' />
                  </div>
                </ClerkLoading>
                <ClerkLoaded>
                  <UserProfile
                    routing='hash'
                    appearance={{
                      elements: {
                        rootBox: 'w-full',
                        card: 'bg-surface-1 border border-subtle dark:border-default',
                        headerTitle: 'hidden',
                        headerSubtitle: 'hidden',
                        formFieldInput:
                          'bg-surface-0 border border-default focus-ring-themed',
                        formButtonPrimary: 'btn btn-primary btn-md',
                        socialButtonsBlockButton: 'btn btn-secondary btn-md',
                        footerActionText: 'text-secondary',
                        footerActionLink: 'text-accent-token',
                      },
                    }}
                  />
                </ClerkLoaded>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
