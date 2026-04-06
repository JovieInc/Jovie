'use client';

import { Badge } from '@jovie/ui';
import { useCallback, useEffect } from 'react';
import { track } from '@/lib/analytics';
import type { PublicContact, PublicContactChannel } from '@/types/contacts';
import { ProfileDrawerShell } from '../ProfileDrawerShell';
import { ChannelIcon } from './ContactIcons';
import { useArtistContacts } from './useArtistContacts';

interface ContactDrawerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly artistName: string;
  readonly artistHandle: string;
  readonly contacts: PublicContact[];
  readonly primaryChannel: (contact: PublicContact) => PublicContactChannel;
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
    <ProfileDrawerShell
      open={open}
      onOpenChange={handleOpenChange}
      title={`Contact ${artistName}`}
      subtitle='Reach the right person without leaving the profile.'
      dataTestId='contact-drawer'
    >
      <div className='flex flex-col gap-0.5'>
        {contacts.map(contact => {
          const primary = primaryChannel(contact);
          const primaryHref = getActionHref(primary);

          return (
            <div
              key={contact.id}
              className='flex items-center justify-between gap-4 rounded-[14px] px-4 py-3'
              data-testid='contact-drawer-item'
            >
              {primaryHref ? (
                <a
                  href={primaryHref}
                  className='flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))]'
                  onClick={() => trackAction(primary, contact)}
                >
                  <div className='flex flex-wrap items-center gap-2'>
                    <span className='text-[14px] font-[470] text-white/88'>
                      {contact.roleLabel}
                    </span>
                    {contact.territorySummary ? (
                      <Badge size='sm'>{contact.territorySummary}</Badge>
                    ) : null}
                  </div>
                  {contact.secondaryLabel ? (
                    <span className='text-[11px] font-[400] text-white/40'>
                      {contact.secondaryLabel}
                    </span>
                  ) : null}
                  {contact.primaryContactLabel ? (
                    <span className='text-[11px] font-[400] text-white/40'>
                      {contact.primaryContactLabel}
                    </span>
                  ) : null}
                </a>
              ) : null}
              <div className='flex shrink-0 items-center gap-2'>
                {contact.channels.map(channel => {
                  const channelHref = getActionHref(channel);
                  if (!channelHref) return null;

                  const channelLabels: Record<string, string> = {
                    email: 'Email',
                    sms: 'Text',
                  };
                  const channelLabel = channelLabels[channel.type] ?? 'Call';
                  return (
                    <a
                      key={`${contact.id}-${channel.type}`}
                      href={channelHref}
                      className='flex h-8 w-8 items-center justify-center rounded-full text-white/50 transition-colors duration-150 hover:bg-white/[0.08] hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))]'
                      aria-label={`${channelLabel} ${contact.roleLabel}`}
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
    </ProfileDrawerShell>
  );
}
