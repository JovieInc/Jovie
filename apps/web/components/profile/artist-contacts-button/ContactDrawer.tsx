'use client';

import { useCallback, useEffect, useRef } from 'react';
import { Drawer } from 'vaul';
import { track } from '@/lib/analytics';
import type { PublicContact, PublicContactChannel } from '@/types/contacts';
import { DRAWER_OVERLAY_CLASS } from '../drawer-overlay-styles';
import { ChannelIcon } from './ContactIcons';

interface ContactDrawerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly artistName: string;
  readonly artistHandle: string;
  readonly contacts: PublicContact[];
  readonly performAction: (
    channel: PublicContactChannel,
    contact: PublicContact
  ) => void;
  readonly primaryChannel: (contact: PublicContact) => PublicContactChannel;
  readonly buildTerritoryLabel: (contact: PublicContact) => string;
}

export function ContactDrawer({
  open,
  onOpenChange,
  artistName,
  artistHandle,
  contacts,
  performAction,
  primaryChannel,
  buildTerritoryLabel,
}: ContactDrawerProps) {
  const historyPushedRef = useRef(false);

  useEffect(() => {
    if (!open) return;

    track('contacts_drawer_open', {
      handle: artistHandle,
      contacts_count: contacts.length,
    });

    if (!historyPushedRef.current) {
      globalThis.history.pushState({ contactDrawer: true }, '');
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
  }, [open, artistHandle, contacts.length, onOpenChange]);

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

  return (
    <Drawer.Root open={open} onOpenChange={handleOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className={DRAWER_OVERLAY_CLASS} />
        <Drawer.Content
          className='fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] w-full max-w-full flex-col overflow-x-hidden rounded-t-[20px] border-t border-subtle bg-surface-2 shadow-xl'
          data-testid='contact-drawer'
          aria-describedby={undefined}
        >
          {/* Drag handle */}
          <div className='mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-quaternary-token/40' />

          <Drawer.Title className='px-6 pt-4 pb-2 text-center text-[15px] font-semibold tracking-tight text-primary-token'>
            Contact {artistName}
          </Drawer.Title>

          <div className='overflow-y-auto overscroll-contain px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]'>
            <div className='space-y-1'>
              {contacts.map(contact => {
                const primary = primaryChannel(contact);
                return (
                  <div
                    key={contact.id}
                    className='flex items-center justify-between gap-3 rounded-xl px-3 py-3 transition-colors duration-150 ease-out hover:bg-black/5 active:bg-black/8'
                    data-testid='contact-drawer-item'
                  >
                    <button
                      type='button'
                      className='flex flex-1 flex-col items-start rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))]'
                      onClick={() => performAction(primary, contact)}
                    >
                      <span className='text-sm font-semibold text-primary-token'>
                        {buildTerritoryLabel(contact)}
                      </span>
                      {contact.secondaryLabel ? (
                        <span className='text-xs text-secondary-token'>
                          {contact.secondaryLabel}
                        </span>
                      ) : null}
                    </button>
                    <div className='flex items-center gap-2'>
                      {contact.channels.map(channel => (
                        <button
                          key={`${contact.id}-${channel.type}`}
                          type='button'
                          className='flex h-10 w-10 items-center justify-center rounded-full text-primary-token transition-colors hover:bg-black/5 active:bg-black/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))]'
                          aria-label={`${channel.type === 'email' ? 'Email' : 'Call'} ${contact.roleLabel}`}
                          onClick={() => performAction(channel, contact)}
                          data-testid='contact-drawer-channel-action'
                        >
                          <ChannelIcon type={channel.type} />
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
