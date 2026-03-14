'use client';

import { useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { Drawer } from 'vaul';
import { TipSelector } from '@/components/molecules/TipSelector';
import { isAllowedVenmoUrl } from '@/components/profile/utils/venmo';
import { track } from '@/lib/analytics';
import { DRAWER_OVERLAY_CLASS } from './drawer-overlay-styles';

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
  useEffect(() => {
    if (!open) return;

    track('tip_drawer_open', {
      handle: artistHandle,
    });

    // Fire tip_page_view pixel event for retargeting
    // @ts-expect-error - joviePixel is set by JoviePixel component
    if (globalThis.joviePixel?.track) {
      // @ts-expect-error - joviePixel is set by JoviePixel component
      globalThis.joviePixel.track('tip_page_view');
    }

    return undefined;
  }, [open, artistHandle]);

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      onOpenChange(isOpen);
    },
    [onOpenChange]
  );

  const handleAmountSelected = useCallback(
    (amount: number) => {
      if (!isAllowedVenmoUrl(venmoLink)) {
        track('tip_handoff_failed', {
          reason: 'invalid_venmo_url',
          handle: artistHandle,
          venmoLink,
        });
        toast.error('Unable to open Venmo. The payment link is not valid.');
        return;
      }

      const sep = venmoLink.includes('?') ? '&' : '?';
      const url = `${venmoLink}${sep}utm_amount=${amount}&utm_username=${encodeURIComponent(
        venmoUsername ?? ''
      )}`;

      // Fire tip_intent pixel event for retargeting
      // @ts-expect-error - joviePixel is set by JoviePixel component
      if (globalThis.joviePixel?.track) {
        // @ts-expect-error - joviePixel is set by JoviePixel component
        globalThis.joviePixel.track('tip_intent', {
          tipAmount: amount,
          tipMethod: 'venmo',
        });
      }

      const win = globalThis.open(url, '_blank', 'noopener,noreferrer');
      if (!win) {
        track('tip_handoff_failed', {
          reason: 'popup_blocked',
          handle: artistHandle,
          amount,
        });
        toast.error(
          'Venmo could not be opened. Please allow pop-ups and try again.'
        );
      }
    },
    [venmoLink, venmoUsername, artistHandle]
  );

  return (
    <Drawer.Root open={open} onOpenChange={handleOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className={DRAWER_OVERLAY_CLASS} />
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
