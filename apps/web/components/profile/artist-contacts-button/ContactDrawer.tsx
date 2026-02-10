'use client';

import { useCallback, useEffect, useRef } from 'react';
import { Drawer } from 'vaul';
import { track } from '@/lib/analytics';
import type { PublicContact, PublicContactChannel } from '@/types/contacts';
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

          <Drawer.Title className='relative z-10 px-6 pt-4 pb-2 text-center text-lg font-semibold text-primary-token'>
            Contact {artistName}
          </Drawer.Title>

          <div className='relative z-10 overflow-y-auto overscroll-contain px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]'>
            <div className='space-y-1'>
              {contacts.map(contact => {
                const primary = primaryChannel(contact);
                return (
                  <div
                    key={contact.id}
                    className='flex items-center justify-between gap-3 rounded-xl px-3 py-3 transition-colors duration-150 ease-out active:bg-[--liquid-glass-item-selected]'
                  >
                    <button
                      type='button'
                      className='flex flex-1 flex-col items-start text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))] rounded-md'
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
                          className='flex h-10 w-10 items-center justify-center rounded-full text-primary-token transition-colors active:bg-[--liquid-glass-item-selected] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))]'
                          aria-label={`${channel.type === 'email' ? 'Email' : 'Call'} ${contact.roleLabel}`}
                          onClick={() => performAction(channel, contact)}
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
