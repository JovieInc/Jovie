'use client';

import { X } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
import { Drawer } from 'vaul';
import { track } from '@/lib/analytics';
import type { AvailableDSP } from '@/lib/dsp';
import type { Artist } from '@/types/db';
import { StaticListenInterface } from './StaticListenInterface';

interface ListenDrawerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly artist: Artist;
  readonly dsps: AvailableDSP[];
  readonly enableDynamicEngagement?: boolean;
}

export function ListenDrawer({
  open,
  onOpenChange,
  artist,
  dsps,
  enableDynamicEngagement = false,
}: ListenDrawerProps) {
  const historyPushedRef = useRef(false);

  // Fire synthetic analytics event when drawer opens for funnel parity
  useEffect(() => {
    if (!open) return;

    track('listen_drawer_open', {
      handle: artist.handle,
    });

    // Push history state so hardware back button closes the drawer
    if (!historyPushedRef.current) {
      globalThis.history.pushState({ listenDrawer: true }, '');
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
  }, [open, artist.handle, onOpenChange]);

  // Clean up history entry when drawer is closed by swipe/overlay tap
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

  // Preload deep-links module when drawer opens
  useEffect(() => {
    if (open) {
      import('@/lib/deep-links').catch(() => {});
    }
  }, [open]);

  return (
    <Drawer.Root open={open} onOpenChange={handleOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className='fixed inset-0 z-40 bg-black/60 backdrop-blur-sm' />
        <Drawer.Content
          className='fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] w-full max-w-full flex-col overflow-x-hidden rounded-t-2xl border-t'
          style={{
            backgroundColor: 'var(--liquid-glass-bg)',
            backdropFilter: `blur(var(--liquid-glass-blur-intense))`,
            WebkitBackdropFilter: `blur(var(--liquid-glass-blur-intense))`,
            borderColor: 'var(--liquid-glass-border)',
            boxShadow: 'var(--liquid-glass-shadow-elevated)',
          }}
          aria-describedby={undefined}
        >
          {/* Specular highlight gradient — top edge light refraction */}
          <div
            className='pointer-events-none absolute inset-x-0 top-0 h-24 rounded-t-2xl'
            style={{ background: 'var(--liquid-glass-highlight)' }}
          />

          {/* Drag handle */}
          <div className='relative z-10 mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-[--liquid-glass-item-selected]' />

          <button
            type='button'
            onClick={() => handleOpenChange(false)}
            className='absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full text-secondary-token transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25'
            aria-label='Close'
          >
            <X size={18} />
          </button>

          <Drawer.Title className='relative z-10 px-6 pt-4 pb-2 text-center text-lg font-semibold text-primary-token'>
            Listen on
          </Drawer.Title>

          <div className='relative z-10 overflow-y-auto overscroll-contain px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]'>
            <div className='flex justify-center'>
              <StaticListenInterface
                artist={artist}
                handle={artist.handle}
                dspsOverride={dsps}
                enableDynamicEngagement={enableDynamicEngagement}
              />
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
