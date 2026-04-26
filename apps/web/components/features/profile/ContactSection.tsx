'use client';

import { useArtistContacts } from '@/features/profile/artist-contacts-button/useArtistContacts';
import { ProfileContactDrawerContent } from '@/features/profile/ProfileContactDrawerContent';
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
  const { available, primaryChannel } = useArtistContacts({
    contacts,
    artistHandle,
  });

  if (available.length === 0) {
    return (
      <div className='text-center'>
        <div className='rounded-[var(--profile-card-radius)] border border-[color:var(--profile-panel-border)] bg-[var(--profile-content-bg)] p-6 shadow-[var(--profile-panel-shadow)] backdrop-blur-2xl'>
          <p className='text-sm text-secondary-token' role='alert'>
            No contact information is available for this artist yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <main className='-mt-1 space-y-3' aria-labelledby='contact-title'>
      <h2 id='contact-title' className='sr-only'>
        Contact {artistName}
      </h2>
      <div className='rounded-[var(--profile-inner-radius)] border border-[color:var(--profile-pearl-border)] bg-[var(--profile-pearl-bg)] p-2 shadow-[var(--profile-pearl-shadow)] backdrop-blur-xl'>
        <ProfileContactDrawerContent
          artistHandle={artistHandle}
          contacts={available}
          primaryChannel={primaryChannel}
        />
      </div>
    </main>
  );
}
