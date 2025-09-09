'use client';

import { ClerkLoaded, ClerkLoading, UserProfile } from '@clerk/nextjs';

import { XMarkIcon } from '@heroicons/react/24/outline';
import { Dialog, DialogContent } from '@/components/ui/dialog';
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

  const handleOpenChange = (open: boolean) => {
    if (!open) handleClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className='relative w-full max-w-3xl transform bg-transparent p-0 shadow-none text-left'>
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
      </DialogContent>
    </Dialog>
  );
}
