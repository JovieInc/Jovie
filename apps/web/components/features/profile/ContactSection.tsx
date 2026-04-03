'use client';

import { Badge } from '@jovie/ui';
import { ChannelIcon } from '@/features/profile/artist-contacts-button/ContactIcons';
import { useArtistContacts } from '@/features/profile/artist-contacts-button/useArtistContacts';
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
  const { available, getActionHref, primaryChannel, trackAction } =
    useArtistContacts({
      contacts,
      artistHandle,
    });

  if (available.length === 0) {
    return (
      <div className='text-center'>
        <div className='rounded-[28px] border border-[color:var(--profile-panel-border)] bg-[var(--profile-content-bg)] p-6 shadow-[var(--profile-panel-shadow)] backdrop-blur-2xl'>
          <p className='text-sm text-secondary-token' role='alert'>
            No contact information is available for this artist yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <main className='-mt-1 space-y-3' aria-labelledby='contact-title'>
      <h1 id='contact-title' className='sr-only'>
        Contact {artistName}
      </h1>
      <div className='space-y-3'>
        {available.map(contact => {
          const primary = primaryChannel(contact);
          const primaryHref = getActionHref(primary);

          return (
            <div
              key={contact.id}
              className='flex items-center justify-between gap-4 rounded-[26px] border border-[color:var(--profile-pearl-border)] bg-[var(--profile-pearl-bg)] px-4 py-4 shadow-[var(--profile-pearl-shadow)] backdrop-blur-xl transition-[background-color,border-color] duration-150 ease-out hover:bg-[var(--profile-pearl-bg-hover)]'
              data-testid='contact-item'
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
                      data-testid='contact-channel-action'
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
    </main>
  );
}
