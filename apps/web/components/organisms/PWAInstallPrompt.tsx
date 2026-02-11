'use client';

import { Button } from '@jovie/ui';
import { Download, X } from 'lucide-react';
import { usePWAInstall } from '@/hooks/usePWAInstall';

export function PWAInstallPrompt() {
  const { canPrompt, isIOS, install, dismiss } = usePWAInstall();

  if (!canPrompt) return null;

  return (
    <div
      className='fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md sm:px-6 md:flex md:items-center md:justify-between md:gap-4'
      style={{
        backgroundColor: 'var(--linear-bg-surface-1)',
        borderTop: '1px solid var(--linear-border-default)',
        boxShadow: 'var(--linear-shadow-card)',
      }}
    >
      <div className='mb-2 flex items-center gap-3 md:mb-0 md:flex-1'>
        <img
          src='/favicon-96x96.png'
          alt=''
          width={40}
          height={40}
          className='hidden shrink-0 rounded-lg sm:block'
        />
        <div>
          <p
            className='font-medium'
            style={{
              fontSize: '13px',
              lineHeight: '1.4',
              color: 'var(--linear-text-primary)',
            }}
          >
            Install Jovie
          </p>
          <p
            style={{
              fontSize: '12px',
              lineHeight: '1.5',
              color: 'var(--linear-text-secondary)',
            }}
          >
            {isIOS
              ? 'Tap the Share button, then "Add to Home Screen" to install.'
              : 'Add Jovie to your dock for quick access.'}
          </p>
        </div>
      </div>

      <div className='flex items-center gap-2 shrink-0'>
        {!isIOS && (
          <Button
            variant='default'
            size='sm'
            onClick={install}
            className='gap-1.5 text-xs'
          >
            <Download className='size-3.5' />
            Install
          </Button>
        )}
        <Button
          variant='ghost'
          size='sm'
          onClick={dismiss}
          className='size-8 p-0'
          aria-label='Dismiss install prompt'
        >
          <X className='size-4' />
        </Button>
      </div>
    </div>
  );
}
