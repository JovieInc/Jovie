'use client';

import { useCallback, useEffect, useRef } from 'react';
import { Drawer } from 'vaul';
import { TipSelector } from '@/components/molecules/TipSelector';
import { track } from '@/lib/analytics';

const ALLOWED_VENMO_HOSTS = new Set(['venmo.com', 'www.venmo.com']);

function isAllowedVenmoUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' && ALLOWED_VENMO_HOSTS.has(parsed.hostname)
    );
  } catch {
    return false;
  }
}

interface TipDrawerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly artistName: string;
  readonly artistHandle: string;
  readonly venmoLink: string;
  readonly venmoUsername?: string | null;
  readonly amounts?: number[];
}

export function TipDrawer({
  open,
  onOpenChange,
  artistName,
  artistHandle,
  venmoLink,
  venmoUsername,
  amounts = [3, 5, 7],
}: TipDrawerProps) {
  const historyPushedRef = useRef(false);

  useEffect(() => {
    if (!open) return;

    track('tip_drawer_open', {
      handle: artistHandle,
    });

    if (!historyPushedRef.current) {
      globalThis.history.pushState({ tipDrawer: true }, '');
      historyPushedRef.current = true;
    }

    const handlePopState = () => {
      if (historyPushedRef.current) {
        historyPushedRef.current = false;
        onOpenChange(false);
      }
    };

    globalThis.addEventListener('popstate', handlePopState);
    return () => globalThis.removeEventListener('popstate', handlePopState);
  }, [open, artistHandle, onOpenChange]);

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen && historyPushedRef.current) {
        historyPushedRef.current = false;
        globalThis.history.back();
      }
      onOpenChange(isOpen);
    },
    [onOpenChange]
  );

  const handleAmountSelected = useCallback(
    (amount: number) => {
      if (!isAllowedVenmoUrl(venmoLink)) return;

      const sep = venmoLink.includes('?') ? '&' : '?';
      const url = `${venmoLink}${sep}utm_amount=${amount}&utm_username=${encodeURIComponent(
        venmoUsername ?? ''
      )}`;

      globalThis.open(url, '_blank', 'noopener,noreferrer');
    },
    [venmoLink, venmoUsername]
  );

  return (
    <Drawer.Root open={open} onOpenChange={handleOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className='fixed inset-0 z-40 bg-black/40 backdrop-blur-sm' />
        <Drawer.Content
          className='fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] w-full max-w-full flex-col overflow-x-hidden rounded-t-[20px] border-t border-subtle bg-surface-2 shadow-xl'
          aria-describedby={undefined}
        >
          {/* Drag handle */}
          <div className='mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-quaternary-token/40' />

          <Drawer.Title className='px-6 pt-4 pb-0.5 text-center text-[15px] font-semibold tracking-tight text-primary-token'>
            Tip {artistName}
          </Drawer.Title>
          <p className='px-6 pb-3 text-center text-xs text-secondary-token'>
            via Venmo
          </p>

          <div className='overflow-y-auto overscroll-contain px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]'>
            <TipSelector
              amounts={amounts}
              onContinue={handleAmountSelected}
              paymentLabel='Venmo'
            />
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
