'use client';

import { Badge } from '@jovie/ui';
import { useCallback, useEffect } from 'react';
import { Drawer } from 'vaul';
import { track } from '@/lib/analytics';
import type { PublicContact, PublicContactChannel } from '@/types/contacts';
import { DRAWER_OVERLAY_CLASS } from '../drawer-overlay-styles';
import { ChannelIcon } from './ContactIcons';
import { useArtistContacts } from './useArtistContacts';

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
  primaryChannel,
}: ContactDrawerProps) {
  useEffect(() => {
    if (!open) return;

    track('contacts_drawer_open', {
      handle: artistHandle,
      contacts_count: contacts.length,
    });

    return undefined;
  }, [open, artistHandle, contacts.length]);

  const { getActionHref, trackAction } = useArtistContacts({
    contacts,
    artistHandle,
  });

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
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
          <div className='mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-quaternary-token/40' />

          <Drawer.Title className='px-6 pt-4 pb-2 text-center text-[15px] font-semibold tracking-tight text-primary-token'>
            Contact {artistName}
          </Drawer.Title>

          <div className='overflow-y-auto overscroll-contain px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]'>
            <div className='space-y-2'>
              {contacts.map(contact => {
                const primary = primaryChannel(contact);
                const primaryHref = getActionHref(primary);

                return (
                  <div
                    key={contact.id}
                    className='flex items-center justify-between gap-3 rounded-xl border border-subtle/70 bg-surface-2 px-3.5 py-3 transition-colors duration-150 ease-out hover:bg-surface-3 active:bg-surface-3'
                    data-testid='contact-drawer-item'
                  >
                    {primaryHref ? (
                      <a
                        href={primaryHref}
                        className='flex flex-1 flex-col items-start gap-1 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))]'
                        onClick={() => trackAction(primary, contact)}
                      >
                        <div className='flex items-center gap-2'>
                          <span className='text-[13px] font-medium text-primary-token'>
                            {contact.roleLabel}
                          </span>
                          {contact.territorySummary ? (
                            <Badge size='sm'>{contact.territorySummary}</Badge>
                          ) : null}
                        </div>
                        {contact.secondaryLabel ? (
                          <span className='text-[11px] text-secondary-token'>
                            {contact.secondaryLabel}
                          </span>
                        ) : null}
                        {contact.primaryContactLabel ? (
                          <span className='text-[11px] text-secondary-token/90'>
                            {contact.primaryContactLabel}
                          </span>
                        ) : null}
                      </a>
                    ) : null}
                    <div className='flex items-center gap-2'>
                      {contact.channels.map(channel => {
                        const channelHref = getActionHref(channel);
                        if (!channelHref) return null;

                        return (
                          <a
                            key={`${contact.id}-${channel.type}`}
                            href={channelHref}
                            className='flex h-9 w-9 items-center justify-center rounded-full text-primary-token transition-colors hover:bg-surface-1 active:bg-surface-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))]'
                            aria-label={`${channel.type === 'email' ? 'Email' : 'Call'} ${contact.roleLabel}`}
                            onClick={() => trackAction(channel, contact)}
                            data-testid='contact-drawer-channel-action'
                          >
                            <ChannelIcon type={channel.type} />
                          </a>
                        );
                      })}
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
