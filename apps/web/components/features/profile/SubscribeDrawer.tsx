'use client';

import { Drawer } from 'vaul';
import {
  ArtistNotificationsCTA,
  TwoStepNotificationsCTA,
} from '@/features/profile/artist-notifications-cta';
import { DRAWER_OVERLAY_CLASS } from '@/features/profile/drawer-overlay-styles';
import type { Artist } from '@/types/db';

interface SubscribeDrawerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly artist: Artist;
  readonly subscribeTwoStep?: boolean;
}

export function SubscribeDrawer({
  open,
  onOpenChange,
  artist,
  subscribeTwoStep = false,
}: SubscribeDrawerProps) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className={DRAWER_OVERLAY_CLASS} />
        <Drawer.Content
          className='fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] w-full max-w-full flex-col overflow-x-hidden rounded-t-2xl border-t'
          style={{
            backgroundColor: 'var(--liquid-glass-bg)',
            backdropFilter: 'blur(var(--liquid-glass-blur-intense))',
            WebkitBackdropFilter: 'blur(var(--liquid-glass-blur-intense))',
            borderColor: 'var(--liquid-glass-border)',
            boxShadow: 'var(--liquid-glass-shadow-elevated)',
          }}
          aria-describedby={undefined}
        >
          <div
            className='pointer-events-none absolute inset-x-0 top-0 h-24 rounded-t-2xl'
            style={{ background: 'var(--liquid-glass-highlight)' }}
          />
          <div className='relative z-10 mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-[--liquid-glass-item-selected]' />
          <Drawer.Title className='relative z-10 px-6 pb-2 pt-4 text-center text-lg font-semibold text-primary-token'>
            Get notified
          </Drawer.Title>
          <div className='relative z-10 overflow-y-auto overscroll-contain px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]'>
            {subscribeTwoStep ? (
              <TwoStepNotificationsCTA artist={artist} />
            ) : (
              <ArtistNotificationsCTA
                artist={artist}
                variant='button'
                autoOpen
              />
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
