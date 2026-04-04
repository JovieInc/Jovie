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
      <div className='space-y-3'>
        {contacts.map(contact => {
          const primary = primaryChannel(contact);
          const primaryHref = getActionHref(primary);

          return (
            <div
              key={contact.id}
              className='flex items-center justify-between gap-4 rounded-[26px] border border-[color:var(--profile-pearl-border)] bg-[var(--profile-pearl-bg)] px-4 py-4 shadow-[var(--profile-pearl-shadow)] backdrop-blur-xl transition-[background-color,border-color] duration-150 ease-out hover:bg-[var(--profile-pearl-bg-hover)]'
              data-testid='contact-drawer-item'
            >
              {primaryHref ? (
                <a
                  href={primaryHref}
                  className='flex min-w-0 flex-1 flex-col items-start gap-1.5 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))]'
                  onClick={() => trackAction(primary, contact)}
                >
                  <div className='flex flex-wrap items-center gap-2'>
                    <span className='text-sm font-[590] text-primary-token'>
                      {contact.roleLabel}
                    </span>
                    {contact.territorySummary ? (
                      <Badge size='sm'>{contact.territorySummary}</Badge>
                    ) : null}
                  </div>
                  {contact.secondaryLabel ? (
                    <span className='text-xs text-secondary-token'>
                      {contact.secondaryLabel}
                    </span>
                  ) : null}
                  {contact.primaryContactLabel ? (
                    <span className='text-xs text-secondary-token/90'>
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
                      className='flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--profile-pearl-border)] bg-[var(--profile-pearl-bg-active)] text-primary-token shadow-[var(--profile-pearl-shadow)] transition-[background-color,border-color] hover:bg-[var(--profile-pearl-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))]'
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
