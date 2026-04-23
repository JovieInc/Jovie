'use client';

import { Badge, Popover, PopoverContent, PopoverTrigger } from '@jovie/ui';
import { ChannelIcon } from '@/features/profile/artist-contacts-button/ContactIcons';
import { useArtistContacts } from '@/features/profile/artist-contacts-button/useArtistContacts';
import type { PublicContact, PublicContactChannel } from '@/types/contacts';

interface ProfileContactDrawerContentProps {
  readonly artistHandle: string;
  readonly contacts: PublicContact[];
  readonly primaryChannel: (contact: PublicContact) => PublicContactChannel;
  readonly interactive?: boolean;
}

function TerritoryPills({
  contact,
}: Readonly<{
  contact: PublicContact;
}>) {
  const territories = contact.territories?.filter(Boolean) ?? [];
  const primaryTerritory = territories[0] ?? contact.territorySummary;

  if (!primaryTerritory) {
    return null;
  }

  if (territories.length <= 1) {
    return <Badge size='sm'>{primaryTerritory}</Badge>;
  }

  return (
    <div className='flex items-center gap-1'>
      <Badge size='sm'>{primaryTerritory}</Badge>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type='button'
            className='inline-flex h-6 items-center rounded-full border border-white/[0.08] bg-white/[0.04] px-2 text-[11px] font-semibold text-white/58 transition-colors duration-150 hover:bg-white/[0.08] hover:text-white/82 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))]'
            aria-label={`Show all territories for ${contact.roleLabel}`}
          >
            +{territories.length - 1}
          </button>
        </PopoverTrigger>
        <PopoverContent
          side='top'
          align='start'
          className='w-auto min-w-[180px] rounded-[18px] border border-white/[0.08] bg-[color:var(--profile-drawer-bg)] p-3 text-white shadow-[0_20px_48px_rgba(0,0,0,0.4)]'
        >
          <p className='text-[11px] font-semibold tracking-[0.08em] text-white/42'>
            Territories
          </p>
          <div className='mt-2 flex flex-wrap gap-1.5'>
            {territories.map(territory => (
              <span
                key={territory}
                className='inline-flex rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-[11px] font-caption text-white/72'
              >
                {territory}
              </span>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function ProfileContactDrawerContent({
  artistHandle,
  contacts,
  primaryChannel: _primaryChannel,
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
        const metadata = [
          contact.companyLabel ?? contact.secondaryLabel,
          contact.contactName ?? contact.primaryContactLabel,
        ]
          .filter(Boolean)
          .join(' · ');
        const channelLabels: Record<string, string> = {
          email: 'Email',
          sms: 'Text',
        };

        return (
          <div
            key={contact.id}
            className='flex items-start justify-between gap-3 rounded-[14px] px-4 py-3.5'
            data-testid='contact-drawer-item'
          >
            <div className='flex min-w-0 flex-1 flex-col items-start gap-1.5 text-left'>
              <div className='flex flex-wrap items-center gap-2'>
                <span className='text-[14px] font-medium text-white/90'>
                  {contact.roleLabel}
                </span>
                <TerritoryPills contact={contact} />
              </div>
              {metadata ? (
                <span className='truncate text-[11px] font-book leading-[1.2] text-white/50'>
                  {metadata}
                </span>
              ) : null}
            </div>
            <div className='mt-0.5 flex shrink-0 items-center gap-1'>
              {contact.channels.map(channel => {
                const channelHref = getActionHref(channel);
                if (!channelHref) return null;

                if (!interactive) {
                  return (
                    <span
                      key={`${contact.id}-${channel.type}`}
                      className='flex h-9 w-9 items-center justify-center rounded-full text-white/50'
                    >
                      <ChannelIcon type={channel.type} />
                    </span>
                  );
                }

                return (
                  <a
                    key={`${contact.id}-${channel.type}`}
                    href={channelHref}
                    className='flex h-9 w-9 items-center justify-center rounded-full text-white/50 transition-colors duration-150 hover:bg-white/[0.08] hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))]'
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
