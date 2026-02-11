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
        <Drawer.Overlay className='fixed inset-0 z-40 bg-black/60 backdrop-blur-sm' />
        <Drawer.Content
          className='fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-2xl border-t'
          style={{
            backgroundColor: 'var(--liquid-glass-bg)',
            backdropFilter: `blur(var(--liquid-glass-blur-intense))`,
            WebkitBackdropFilter: `blur(var(--liquid-glass-blur-intense))`,
            borderColor: 'var(--liquid-glass-border)',
            boxShadow: 'var(--liquid-glass-shadow-elevated)',
          }}
          aria-describedby={undefined}
        >
          {/* Specular highlight */}
          <div
            className='pointer-events-none absolute inset-x-0 top-0 h-24 rounded-t-2xl'
            style={{ background: 'var(--liquid-glass-highlight)' }}
          />

          {/* Drag handle */}
          <div className='relative z-10 mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-[--liquid-glass-item-selected]' />

          <Drawer.Title className='relative z-10 px-6 pt-4 pb-0.5 text-center text-[15px] font-semibold tracking-tight text-primary-token'>
            Tip {artistName}
          </Drawer.Title>
          <p className='relative z-10 px-6 pb-2 text-center text-xs text-secondary-token'>
            via Venmo
          </p>

          <div className='relative z-10 overflow-y-auto overscroll-contain px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]'>
            <TipSelector amounts={amounts} onContinue={handleAmountSelected} />
            <p className='mt-4 text-center text-xs text-tertiary-token'>
              You&apos;ll be redirected to Venmo to complete your tip.
            </p>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
