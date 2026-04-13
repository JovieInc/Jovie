'use client';

import { Badge } from '@jovie/ui';
import { ChannelIcon } from '@/features/profile/artist-contacts-button/ContactIcons';
import { useArtistContacts } from '@/features/profile/artist-contacts-button/useArtistContacts';
import type { PublicContact, PublicContactChannel } from '@/types/contacts';

interface ProfileContactDrawerContentProps {
  readonly artistHandle: string;
  readonly contacts: PublicContact[];
  readonly primaryChannel: (contact: PublicContact) => PublicContactChannel;
  readonly interactive?: boolean;
}

export function ProfileContactDrawerContent({
  artistHandle,
  contacts,
  primaryChannel,
  interactive = true,
}: ProfileContactDrawerContentProps) {
  const { getActionHref, trackAction } = useArtistContacts({
    contacts,
    artistHandle,
  });

  return (
    <div
      className='flex flex-col gap-0.5'
      data-testid='profile-contact-drawer-content'
    >
      {contacts.map(contact => {
        const primary = primaryChannel(contact);
        const primaryHref = getActionHref(primary);
        const channelLabels: Record<string, string> = {
          email: 'Email',
          sms: 'Text',
        };

        return (
          <div
            key={contact.id}
            className='flex items-center justify-between gap-4 rounded-[14px] px-4 py-3'
            data-testid='contact-drawer-item'
          >
            {interactive && primaryHref ? (
              <a
                href={primaryHref}
                onClick={() => trackAction(primary, contact)}
                className='flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))]'
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
            ) : (
              <div className='flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left'>
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
              </div>
            )}
            <div className='flex shrink-0 items-center gap-2'>
              {contact.channels.map(channel => {
                const channelHref = getActionHref(channel);
                if (!channelHref) return null;

                if (!interactive) {
                  return (
                    <span
                      key={`${contact.id}-${channel.type}`}
                      className='flex h-8 w-8 items-center justify-center rounded-full text-white/50'
                    >
                      <ChannelIcon type={channel.type} />
                    </span>
                  );
                }

                return (
                  <a
                    key={`${contact.id}-${channel.type}`}
                    href={channelHref}
                    className='flex h-8 w-8 items-center justify-center rounded-full text-white/50 transition-colors duration-150 hover:bg-white/[0.08] hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))]'
                    aria-label={`${channelLabels[channel.type] ?? 'Call'} ${contact.roleLabel}`}
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
  );
}
