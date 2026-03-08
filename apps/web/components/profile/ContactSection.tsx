'use client';

import { Badge } from '@jovie/ui';
import { ChannelIcon } from '@/components/profile/artist-contacts-button/ContactIcons';
import { useArtistContacts } from '@/components/profile/artist-contacts-button/useArtistContacts';
import type { PublicContact } from '@/types/contacts';

interface ContactSectionProps {
  readonly contacts: PublicContact[];
  readonly artistName: string;
  readonly artistHandle: string;
}

/**
 * Inline contact list for desktop contact mode.
 * Renders the same content as ContactDrawer but as a page section rather than a vaul drawer.
 */
export function ContactSection({
  contacts,
  artistName,
  artistHandle,
}: ContactSectionProps) {
  const { available, performAction, primaryChannel } = useArtistContacts({
    contacts,
    artistHandle,
  });

  if (available.length === 0) {
    return (
      <div className='text-center'>
        <div className='rounded-2xl border border-subtle bg-surface-1 p-6 shadow-sm'>
          <p className='text-sm text-secondary-token' role='alert'>
            No contact information is available for this artist yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <main className='space-y-4' aria-labelledby='contact-title'>
      <h1 id='contact-title' className='sr-only'>
        Contact {artistName}
      </h1>
      <div className='rounded-2xl border border-subtle bg-surface-1 p-2 shadow-sm'>
        <div className='space-y-2'>
          {available.map(contact => {
            const primary = primaryChannel(contact);
            return (
              <div
                key={contact.id}
                className='flex items-center justify-between gap-3 rounded-xl border border-subtle/70 bg-surface-2 px-3.5 py-3 transition-colors duration-150 ease-out hover:bg-surface-3 active:bg-surface-3'
                data-testid='contact-item'
              >
                <button
                  type='button'
                  className='flex flex-1 flex-col items-start gap-1 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))]'
                  onClick={() => performAction(primary, contact)}
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
                </button>
                <div className='flex items-center gap-2'>
                  {contact.channels.map(channel => (
                    <button
                      key={`${contact.id}-${channel.type}`}
                      type='button'
                      className='flex h-9 w-9 items-center justify-center rounded-full text-primary-token transition-colors hover:bg-surface-1 active:bg-surface-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))]'
                      aria-label={`${channel.type === 'email' ? 'Email' : 'Call'} ${contact.roleLabel}`}
                      onClick={() => performAction(channel, contact)}
                      data-testid='contact-channel-action'
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
    </main>
  );
}
