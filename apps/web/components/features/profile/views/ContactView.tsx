'use client';

import type { PublicContact, PublicContactChannel } from '@/types/contacts';
import { ProfileContactDrawerContent } from '../ProfileContactDrawerContent';

export interface ContactViewProps {
  readonly artistHandle: string;
  readonly contacts: PublicContact[];
  readonly primaryChannel: (contact: PublicContact) => PublicContactChannel;
}

/**
 * Body of the `contact` mode: management / booking / press channels.
 *
 * Pure view component — no title or shell. The enclosing wrapper owns chrome.
 */
export function ContactView({
  artistHandle,
  contacts,
  primaryChannel,
}: ContactViewProps) {
  return (
    <ProfileContactDrawerContent
      artistHandle={artistHandle}
      contacts={contacts}
      primaryChannel={primaryChannel}
    />
  );
}
