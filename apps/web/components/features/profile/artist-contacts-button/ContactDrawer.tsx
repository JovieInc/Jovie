'use client';

import { useCallback, useEffect } from 'react';
import { track } from '@/lib/analytics';
import type { PublicContact, PublicContactChannel } from '@/types/contacts';
import { ProfileDrawerShell } from '../ProfileDrawerShell';
import { ContactView } from '../views/ContactView';

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
      subtitle='Booking, management, and press.'
      dataTestId='contact-drawer'
    >
      <ContactView
        artistHandle={artistHandle}
        contacts={contacts}
        primaryChannel={primaryChannel}
      />
    </ProfileDrawerShell>
  );
}
